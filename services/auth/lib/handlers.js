const helpers = require('../../../lib/modules/responseHelpers');
const builder = require('./modules/queryBuilder');
const passport = require('@passport-next/passport');
const editURL = require('edit-url');
const state = require('./state');
const debug = require('debug')('campsi:service:auth');
const { ObjectId } = require('mongodb');
const createError = require('http-errors');
const { deleteExpiredTokens } = require('./tokens');
const { getUsersCollectionName } = require('./modules/collectionNames');
const createObjectId = require('../../../lib/modules/createObjectId');
const disposableDomains = require('disposable-email-domains');
const sanitizeHtml = require('sanitize-html');

async function tokenMaintenance(req, res) {
  if (!req?.user?.isAdmin) {
    return helpers.unauthorized(res);
  }

  // this aggregation only returns users that have expired tokens to archive
  if (req?.query?.action === 'deleteExpiredTokens') {
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
        $project: {
          user: 1,
          expiredTokens: 1,
          tokens: {
            $gt: [
              {
                $size: '$expiredTokens'
              },
              1
            ]
          }
        }
      },
      {
        $match: {
          tokens: true
        }
      },
      {
        $project: {
          user: 1
        }
      }
    ];

    const cursor = req.db.collection('__users__').aggregate(aggregation);

    for await (const user of cursor) {
      try {
        await deleteExpiredTokens(user.user.tokens, user._id, req.db);
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
    const usersCollection = req.db.collection(getUsersCollectionName());
    const token = req.authBearerToken;
    const user = req.user;

    const result = await usersCollection.findOneAndUpdate(
      { _id: user._id, [`tokens.${token}.doNotDelete`]: { $exists: false } },
      { $unset: { [`tokens.${token}`]: '', token: '' } },
      { returnDocument: 'before' }
    );

    if (!result?.value) {
      return res.json({ message: 'user not signed out' });
    }

    res.json({ message: 'signed out' });

    const tokenToArchive = {
      userId: user._id,
      token,
      ...result.value.tokens[token]
    };
    return req.db.collection(`${getUsersCollectionName()}.tokens_log`).insertOne(tokenToArchive);
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
}

function me(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }
  delete req.user.identities?.local?.encryptedPassword;

  res.json(req.user);

  req.db
    .collection(getUsersCollectionName())
    .findOneAndUpdate({ _id: req.user._id }, { $set: { lastSeenAt: new Date() } }, {})
    .then(_result => {})
    .catch(error => helpers.error(res, error));
}

function updateMe(req, res) {
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

  req.db
    .collection(getUsersCollectionName())
    .findOneAndUpdate({ _id: req.user._id }, update, {
      returnDocument: 'after',
      projection: { 'identities.local.encryptedPassword': 0 }
    })
    .then(result => res.json(result.value))
    .catch(error => helpers.error(res, error));
}

function patchMe(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  const allowedProps = ['displayName', 'data', 'identities', 'email'];
  const update = { $set: {} };

  for (const [key, value] of Object.entries(req.body)) {
    if (allowedProps.filter(prop => key.startsWith(prop)).length && !!value) {
      update.$set[key] = value;
    }
  }

  req.db
    .collection(getUsersCollectionName())
    .findOneAndUpdate({ _id: req.user._id }, update, {
      returnDocument: 'after'
    })
    .then(result => res.json(result.value))
    .catch(error => helpers.error(res, error));
}

function createAnonymousUser(req, res) {
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
    token: token.value,
    createdAt: new Date()
  };
  req.db
    .collection(getUsersCollectionName())
    .insertOne(insert)
    .then(insertResult => {
      res.json({ _id: insertResult.insertedId, ...insert });
    });
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
  const { redirectURI } = state.get(req);
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
        return redirectWithError(req, res, createError(400, 'invalid redirectURI'), next);
      }
      res.redirect(
        editURL(redirectURI, obj => {
          obj.query.access_token = req.authBearerToken;
        })
      );
    }
    if (req.session) {
      req.session.destroy(() => {
        debug('session destroyed');
      });
    }
  });
}

function redirectWithError(req, res, err, next) {
  const { redirectURI } = state.get(req);
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
      const users = await req.db
        .collection(getUsersCollectionName())
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

function getAccessTokenForUser(req, res) {
  if (req.user && req.user.isAdmin) {
    let userId;
    try {
      userId = new ObjectId(req.params.userId);
    } catch (e) {
      return redirectWithError(req, res, new Error('Erroneous userId'));
    }
    const { update, updateToken } = builder.genUpdate({ name: 'impersonatingByAdmin' }, {});
    req.db
      .collection(getUsersCollectionName())
      .findOneAndUpdate({ _id: userId }, update, {
        returnDocument: 'after'
      })
      .then(result => {
        if (result.value) {
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
      });
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
    const result = await req.db
      .collection(getUsersCollectionName())
      .findOneAndUpdate(filter, update, { returnDocument: 'after' });

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

    if (result.value) {
      const doc = result.value;
      const { update } = builder.genUpdate(provider, profile);
      await req.db.collection(getUsersCollectionName()).updateOne({ _id: doc._id }, update);
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

      const result = await req.db.collection(getUsersCollectionName()).insertOne(insert);
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
    const updateResult = await req.db
      .collection(getUsersCollectionName())
      .findOneAndUpdate(
        query,
        { $unset: { [`identities.invitation-${req.params.invitationToken}`]: true } },
        { returnDocument: 'before' }
      );

    const doc = updateResult.value;
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
    req.service.emit('invitation/accepted', payload);
    await cleanupExpiredInvitations(req.user, req.db);
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
    const updateResult = await req.db
      .collection(getUsersCollectionName())
      .findOneAndUpdate(
        query,
        { $unset: { [`identities.invitation-${req.params.invitationToken}`]: true } },
        { returnDocument: 'before' }
      );

    const doc = updateResult.value;
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
    await cleanupExpiredInvitations(req.user, req.db);
  } catch (err) {
    return helpers.error(res, err);
  }
}

const cleanupExpiredInvitations = async (user, db) => {
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
    await db.collection(getUsersCollectionName()).updateOne({ _id: user._id }, update);
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
      const user = await req.db.collection(getUsersCollectionName()).findOne(
        { _id: userId },
        {
          projection: {
            email: 1,
            displayname: 1,
            picture: 1,
            identities: {
              local: { id: 1, username: 1 },
              google: { id: 1, sub: 1, name: 1, given_name: 1, familly_name: 1, picture: 1, email: 1 },
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

      const update = { $set: { email: '', displayName: '', picture: '', data: {}, identities: {}, deletedAt: new Date() } };
      const result = await req.db
        .collection('__users__')
        .findOneAndUpdate({ _id: userId, deletedAt: { $exists: false } }, update, { returnDocument: 'after' });

      if (result && result.value) {
        return res.json(result.value);
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

/**
 * The function `sanitizeHTMLFromXSS` is used to sanitize HTML strings and objects from potential cross-site scripting (XSS) attacks.
 * @param obj - The `obj` parameter is the input object that you want to sanitize from potential XSS (Cross-Site Scripting) attacks.
 * It can be a string or an object containing strings.
 * @returns The function `sanitizeHTMLFromXSS` returns the sanitized version of the input object, with any potentially harmful HTML
 * tags or attributes removed.
 */
function sanitizeHTMLFromXSS(obj) {
  if (!obj) return obj;
  switch (typeof obj) {
    case 'string':
      return sanitizeHtml(obj);
    case 'object':
      return Object.entries(obj).reduce((acc, [key, value]) => {
        acc[key] = sanitizeHTMLFromXSS(value);
        return acc;
      }, obj);
    default:
      return obj;
  }
}

async function getUserByInvitationToken(req, res, next) {
  const invitationToken = req.params.invitationToken;
  if (!invitationToken) {
    return helpers.missingParameters(res, new Error('invitationToken must be specified'));
  }
  const user = await req.db
    .collection(getUsersCollectionName())
    .findOne({ [`identities.invitation-${invitationToken}`]: { $exists: true } });
  if (!user) {
    return helpers.notFound(res, new Error('No user was found with this invitation token'));
  }
  const redactedUser = (({ _id, email, displayName }) => ({ _id, email, displayName }))(user);
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
  sanitizeHTMLFromXSS,
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
