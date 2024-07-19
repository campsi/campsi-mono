const helpers = require('../../../lib/modules/responseHelpers');
const builder = require('./modules/queryBuilder');
const passport = require('@passport-next/passport');
const editURL = require('edit-url');
const state = require('./state');
const debug = require('debug')('campsi:service:auth');
const { ObjectId } = require('mongodb');
const createError = require('http-errors');
const { deleteExpiredTokens } = require('./tokens');
const { getUsersCollection } = require('./modules/authCollections');
const createObjectId = require('../../../lib/modules/createObjectId');
const disposableDomains = require('disposable-email-domains');

async function tokenMaintenance(req, res) {
  if (!req?.user?.isAdmin) {
    return helpers.unauthorized(res);
  }

  // this aggregation only returns users that have expired tokens to archive
  if (req?.query?.action === 'deleteExpiredTokens') {
    const usersCollection = await getUsersCollection(req.campsi, req.service.path);

    const aggregation = [
      {
        $project: {
          user: '$$ROOT',
          expiredTokens: {
            $filter: {
              input: { $objectToArray: '$$ROOT.tokens' },
              as: 'tokens',
              cond: {
                $lte: ['$$tokens.v.expiration', '$$NOW']
              }
            }
          }
        }
      },
      {
        $match: {
          'expiredTokens.1': { $exists: true }
        }
      },
      {
        $project: {
          user: 1,
          expiredTokens: { $arrayToObject: '$expiredTokens' }
        }
      }
    ];

    const cursor = usersCollection.aggregate(aggregation);

    for await (const user of cursor) {
      try {
        await deleteExpiredTokens(user.user.tokens, user._id, req.db, undefined, usersCollection);
      } catch (e) {
        console.log(e);
      }
    }

    res.json();
  } else {
    return helpers.badRequest(res);
  }
}

async function logout(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }
  try {
    const usersCollection = await getUsersCollection(req.campsi, req.service.path);
    const token = req.authBearerToken;
    const user = req.user;

    const result = await usersCollection.findOneAndUpdate(
      { _id: user._id, [`tokens.${token}.doNotDelete`]: { $exists: false } },
      { $unset: { [`tokens.${token}`]: '', token: '' } },
      { returnDocument: 'before' }
    );

    if (!result) {
      return res.json({ message: 'user not signed out' });
    }

    res.json({ message: 'signed out' });

    const tokenToArchive = {
      userId: user._id,
      token,
      ...result.tokens[token]
    };
    return req.db.collection(`${usersCollection.collectionName}.tokens_log`).insertOne(tokenToArchive);
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
}

async function me(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }
  delete req.user.identities?.local?.encryptedPassword;

  res.json(req.user);

  try {
    const usersCollection = await getUsersCollection(req.campsi, req.service.path);
    await usersCollection.updateOne({ _id: req.user._id }, { $set: { lastSeenAt: new Date() } });
  } catch (e) {
    helpers.error(res, e);
  }
}

async function updateMe(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  const allowedProps = ['displayName', 'data', 'identities', 'email'];
  const update = { $set: {} };

  allowedProps.forEach(prop => {
    if (req.body[prop]) {
      update.$set[prop] = req.body[prop];
    }
  });

  try {
    const usersCollection = await getUsersCollection(req.campsi, req.service.path);
    const result = await usersCollection.findOneAndUpdate({ _id: req.user._id }, update, {
      returnDocument: 'after',
      projection: { 'identities.local.encryptedPassword': 0 }
    });
    res.json(result);
  } catch (e) {
    helpers.error(res, e);
  }
}

async function patchMe(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  const allowedProps = ['displayName', 'firstName', 'lastName', 'data'];
  const update = { $set: {} };

  for (const [key, value] of Object.entries(req.body)) {
    if ((allowedProps.includes(key) || key.startsWith('data.')) && !!value) {
      update.$set[key] = value;
    }
  }
  try {
    const usersCollection = await getUsersCollection(req.campsi, req.service.path);
    const result = await usersCollection.findOneAndUpdate({ _id: req.user._id }, update, {
      returnDocument: 'after'
    });
    res.json(result);

    req.service.emit('user/patched', { userId: req.user._id, update: update.$set });
  } catch (e) {
    helpers.error(res, e);
  }
}

async function createAnonymousUser(req, res) {
  const token = builder.genBearerToken(100);
  const insert = {
    identities: {},
    tokens: {
      [token.value]: {
        expiration: token.expiration,
        grantedByProvider: 'anonymous'
      }
    },
    email: token.value,
    createdAt: new Date()
  };

  try {
    const usersCollection = await getUsersCollection(req.campsi, req.service.path);
    const result = await usersCollection.insertOne(insert);
    res.json({ _id: result.insertedId, ...insert });
  } catch (e) {
    helpers.error(res, e);
  }
}

function getProviders(req, res) {
  const ret = [];
  // eslint-disable-next-line array-callback-return
  Object.entries(req.authProviders).map(([name, provider]) => {
    ret.push({
      name,
      title: provider.title,
      buttonStyle: provider.buttonStyle,
      scope: provider.scope
    });
  });

  ret.sort((a, b) => a.order - b.order);
  res.json(ret);
}

async function callback(req, res, next) {
  let { redirectURI } = state.get(req);
  const redirectUriFromState = !!redirectURI;
  if (!redirectURI && req.authProvider.name === 'local') {
    redirectURI = req.query.redirectURI;
  }
  // noinspection JSUnresolvedFunction
  await passport.authenticate(req.authProvider.name, {
    session: false,
    failWithError: true
  })(req, res, err => {
    if (err) {
      return redirectWithError(req, res, err, next);
    }
    if (!req.user) {
      return redirectWithError(req, res, createError(401, 'unable to authentify user'), next);
    }
    if (!redirectURI) {
      try {
        res.json({ token: req.authBearerToken });
      } catch (err) {
        debug('Catching headers', err);
      }
    } else {
      if (req.authProvider.options?.validateRedirectURI && !req.authProvider.options.validateRedirectURI(redirectURI)) {
        delete req.query.redirectURI;
        return redirectWithError(req, res, createError(400, 'invalid redirectURI'), next);
      }
      if (req.method === 'GET' || redirectUriFromState) {
        res.redirect(
          editURL(redirectURI, obj => {
            obj.query.access_token = req.authBearerToken;
          })
        );
      } else {
        res.json({ token: req.authBearerToken, redirectURI });
      }
    }
    if (req.session) {
      req.session.destroy(() => {
        debug('session destroyed');
      });
    }
  });
}

function redirectWithError(req, res, err, next) {
  let { redirectURI, defaultRedirectURI } = state.get(req);
  if (req.authProvider.options?.validateRedirectURI && !req.authProvider.options.validateRedirectURI(redirectURI)) {
    redirectURI = req.authProvider.options.validateRedirectURI(defaultRedirectURI) ? defaultRedirectURI : null;
  }
  if (!redirectURI) {
    next ? next(err) : helpers.error(res, err);
  } else {
    res.redirect(
      editURL(redirectURI, obj => {
        obj.query.error = err.message || err;
      })
    );
  }
}

function getUserFilterFromQuery(query) {
  const filter = {};
  if (query.provider) {
    filter[`identities.${query.provider}`] = { $exists: true };
  }
  if (query.email) {
    filter.email = query.email;
  }
  if (query.userId) {
    try {
      filter._id = new ObjectId(query.userId);
    } catch (e) {
      debug('erroneous ObjectId', query.userId);
      return { _id: null };
    }
  }
  return filter;
}

async function getUsers(req, res) {
  if (req.user && req.user.isAdmin) {
    try {
      const usersCollection = await getUsersCollection(req.campsi, req.service.path);
      const users = await usersCollection
        .find(getUserFilterFromQuery(req.query), {
          projection: { 'identities.local.encryptedPassword': 0 }
        })
        .toArray();
      return res.json(users);
    } catch (err) {
      return redirectWithError(req, res, err);
    }
  } else {
    redirectWithError(req, res, new Error('Only admin users are allowed to show users'));
  }
}

async function getAccessTokenForUser(req, res) {
  if (req.user && req.user.isAdmin) {
    let userId;
    try {
      userId = new ObjectId(req.params.userId);
    } catch (e) {
      return redirectWithError(req, res, new Error('Erroneous userId'));
    }
    const { update, updateToken } = builder.genUpdate({ name: 'impersonatingByAdmin' }, {});
    try {
      const usersCollection = await getUsersCollection(req.campsi, req.service.path);
      const result = await usersCollection.findOneAndUpdate({ _id: userId }, update, {
        returnDocument: 'after'
      });
      if (result) {
        if (!req.query.redirectURI) {
          return res.json({ token: updateToken.value });
        }
        res.redirect(
          editURL(req.query.redirectURI, url => {
            url.query.access_token = updateToken.value;
          })
        );
      } else {
        helpers.notFound(res, new Error('Unknown user'));
      }
    } catch (e) {}
  } else {
    redirectWithError(req, res, new Error('Only admin users are allowed to show users'));
  }
}

/**
 * Entry point of the authentification workflow.
 * There's no req.user yet.
 *
 * @param req
 * @param res
 * @param next
 */
function initAuth(req, res, next) {
  const params = {
    session: false,
    state: state.serialize(req),
    scope: req.authProvider.scope
  };
  debug(params, req.authProvider);
  // noinspection JSUnresolvedFunction
  passport.authenticate(req.params.provider, params)(req, res, next);
}

async function inviteUser(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res, new Error('You must be authentified to send an invitation'));
  }
  const invitationToken = builder.genBearerToken(100);
  const dispatchInvitationEvent = function (payload) {
    req.service.emit('invitation/created', payload);
  };
  const filter = {
    email: new RegExp('^' + req.body.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
  };
  const update = { $set: { updatedAt: new Date() } };
  // if user exists with the given email, we return the id
  try {
    const usersCollection = await getUsersCollection(req.campsi, req.service.path);
    const doc = await usersCollection.findOneAndUpdate(filter, update, {
      returnDocument: 'after'
    });

    const provider = {
      name: `invitation-${invitationToken.value}`,
      expiration: 20
    };
    const profile = {
      email: req.body.email,
      displayName: req.body.displayName,
      identity: {
        invitedBy: req.user._id,
        token: invitationToken,
        data: req.body.data
      }
    };

    if (doc) {
      const { update } = builder.genUpdate(provider, profile);
      await usersCollection.updateOne({ _id: doc._id }, update);
      res.json({ id: doc._id.toString(), invitationToken });

      return dispatchInvitationEvent({
        id: doc._id,
        email: doc.email,
        invitedBy: req.user._id,
        token: invitationToken,
        requestBody: req.body,
        requestHeaders: req.headers
      });
    } else {
      const { insert, insertToken } = builder.genInsert(provider, profile);

      const result = await usersCollection.insertOne(insert);
      res.json({ id: result.insertedId, insertToken, invitationToken });
      dispatchInvitationEvent({
        id: result.insertedId,
        email: profile.email,
        invitedBy: req.user._id,
        token: invitationToken,
        requestBody: req.body,
        requestHeaders: req.headers
      });
    }
  } catch (err) {
    return helpers.error(res, err);
  }
}

async function acceptInvitation(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res, new Error('You must be authentified to accept an invitation'));
  }
  const query = {
    _id: req.user._id,
    [`identities.invitation-${req.params.invitationToken}.token.expiration`]: {
      $gt: new Date()
    }
  };
  try {
    const usersCollection = await getUsersCollection(req.campsi, req.service.path);
    const doc = await usersCollection.findOneAndUpdate(
      query,
      {
        $unset: {
          [`identities.invitation-${req.params.invitationToken}`]: true
        }
      },
      { returnDocument: 'before' }
    );

    if (!doc) {
      debug('No user was found nor updated in query', query);
      return helpers.notFound(res, new Error('No user was found with this invitation token'));
    }
    if (doc.identities?.local?.validationToken) {
      req.user = await usersCollection.findOneAndUpdate(
        { _id: doc._id },
        {
          $set: { 'identities.local.validated': true },
          $unset: { 'identities.local.validationToken': '' }
        },
        { returnDocument: 'after' }
      );
    }
    const invitation = doc.identities[`invitation-${req.params.invitationToken}`];
    const payload = {
      userId: req.user._id,
      invitedUserId: doc._id,
      invitedBy: invitation.invitedBy,
      data: invitation.data,
      requestBody: req.body,
      requestHeaders: req.headers
    };
    res.json(payload);
    req.service.emit('invitation/accepted', payload);
    await cleanupExpiredInvitations(req.user, usersCollection);
  } catch (err) {
    return helpers.error(res, err);
  }
}

async function deleteInvitation(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res, new Error('You must be authentified to delete an invitation'));
  }
  const query = {
    _id: req.user._id,
    [`identities.invitation-${req.params.invitationToken}`]: { $exists: true }
  };
  try {
    const usersCollection = await getUsersCollection(req.campsi, req.service.path);
    const doc = await usersCollection.findOneAndUpdate(
      query,
      {
        $unset: {
          [`identities.invitation-${req.params.invitationToken}`]: true
        }
      },
      { returnDocument: 'before' }
    );

    if (!doc) {
      debug('No user was found nor updated in query', query);
      return helpers.notFound(res, new Error('No user was found with this invitation token'));
    }
    const invitation = doc.identities[`invitation-${req.params.invitationToken}`];
    const payload = {
      userId: req.user._id,
      invitedUserId: doc._id,
      invitedBy: invitation.invitedBy,
      data: invitation.data,
      requestBody: req.body,
      requestHeaders: req.headers
    };
    res.json(payload);
    req.service.emit('invitation/deleted', payload);
    await cleanupExpiredInvitations(req.user, usersCollection);
  } catch (err) {
    return helpers.error(res, err);
  }
}

const cleanupExpiredInvitations = async (user, usersCollection) => {
  const expiredInvitations = Object.entries(user.identities || {})
    .map(([provider, identity]) => {
      if (!provider.startsWith('invitation')) {
        return false;
      }
      if (identity.token?.expiration && new Date() < new Date(identity.token.expiration)) {
        return false;
      }
      return provider;
    })
    .filter(Boolean);
  if (expiredInvitations.length) {
    const update = { $unset: {} };
    expiredInvitations.forEach(key => {
      update.$unset[`identities.${key}`] = true;
    });
    await usersCollection.updateOne({ _id: user._id }, update);
  }
};

async function extractUserPersonalData(req, res) {
  if (req.user && req.user?.isAdmin) {
    let userId;
    try {
      userId = new ObjectId(req.params.userId);
    } catch (e) {
      return redirectWithError(req, res, new Error('Erroneous userId'));
    }

    try {
      const usersCollection = await getUsersCollection(req.campsi, req.service.path);
      const user = await usersCollection.findOne(
        { _id: userId },
        {
          projection: {
            email: 1,
            displayname: 1,
            picture: 1,
            identities: {
              local: { id: 1, username: 1 },
              google: {
                id: 1,
                sub: 1,
                name: 1,
                given_name: 1,
                familly_name: 1,
                picture: 1,
                email: 1
              },
              facebook: { id: 1, name: 1, email: 1 }
            }
          }
        }
      );
      if (!user) {
        return helpers.notFound(res);
      }
      res.json(user);
    } catch (err) {
      return helpers.error(res, err);
    }
  } else {
    return helpers.unauthorized(res, new Error('Only admin users can extract personal data for users'));
  }
}

async function softDelete(req, res) {
  if (req.user && req.user.isAdmin) {
    let userId;
    try {
      userId = createObjectId(req.params.userId);
      if (!userId) {
        return redirectWithError(req, res, new Error('Erroneous userId'));
      }

      const update = {
        $set: {
          email: '',
          displayName: '',
          firstName: '',
          lastName: '',
          picture: '',
          data: {},
          identities: {},
          deletedAt: new Date()
        }
      };
      const result = await req.db
        .collection('__users__')
        .findOneAndUpdate({ _id: userId, deletedAt: { $exists: false } }, update, {
          returnDocument: 'after'
        });

      if (result) {
        return res.json(result);
      }
      helpers.notFound(res, new Error('User not found or already soft deleted'));
    } catch (err) {
      helpers.error(res, err);
    }
  } else {
    return helpers.unauthorized(res);
  }
}

/**
 * The function checks if an email is valid and not from a disposable domain.
 * @param email - The email parameter is a string representing an email address that needs to be validated.
 * @returns The function `isEmailValid` returns a boolean value indicating whether the input email
 * is valid or not. It checks if the email matches the regular expression for a valid email format
 * and if the domain is not included in the `disposableDomains` array.
 */
function isEmailValid(email) {
  const domain = email.split('@')[1];
  return !(
    !/^(([^<>()[\].,;:\s@"]+(\.[^<>()[\].,;:\s@"]+)*)|(".+"))@(([^<>()[\].,;:\s@"]+\.)+[^<>()[\].,;:\s@"]{2,})$/i.test(email) ||
    disposableDomains.includes(domain)
  );
}

async function getUserByInvitationToken(req, res, next) {
  const invitationToken = req.params.invitationToken;
  if (!invitationToken) {
    return helpers.missingParameters(res, new Error('invitationToken must be specified'));
  }
  const usersCollection = await getUsersCollection(req.campsi, req.service.path);
  const user = await usersCollection.findOne({
    [`identities.invitation-${invitationToken}`]: { $exists: true }
  });
  if (!user) {
    return helpers.notFound(res, new Error('No user was found with this invitation token'));
  }
  const redactedUser = (({ _id, email, displayName }) => ({
    _id,
    email,
    displayName
  }))(user);
  redactedUser.identityProviders = Object.entries(user.identities)
    .filter(([key, value]) => !!req.authProviders[key] && !!value.id)
    .map(([key, value]) => key);
  res.json(redactedUser);
}

module.exports = {
  initAuth,
  isEmailValid,
  redirectWithError,
  callback,
  getProviders,
  getUsers,
  getAccessTokenForUser,
  me,
  updateMe,
  patchMe,
  createAnonymousUser,
  logout,
  inviteUser,
  acceptInvitation,
  deleteInvitation,
  tokenMaintenance,
  extractUserPersonalData,
  softDelete,
  getUserByInvitationToken
};
