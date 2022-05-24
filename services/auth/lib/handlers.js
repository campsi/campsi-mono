const helpers = require('../../../lib/modules/responseHelpers');
const {
  getValidGroupsFromString
} = require('../../../lib/modules/groupsHelpers');
const builder = require('./modules/queryBuilder');
const passport = require('@passport-next/passport');
const editURL = require('edit-url');
const state = require('./state');
const debug = require('debug')('campsi:service:auth');
const { ObjectId } = require('mongodb');

function logout(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  let update = { $set: { token: 'null' } };
  req.db
    .collection('__users__')
    .findOneAndUpdate({ _id: req.user._id }, update)
    .then(() => {
      return res.json({ message: 'signed out' });
    })
    .catch(error => {
      return helpers.error(res, error);
    });
}

function me(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }
  delete req.user.identities?.local?.encryptedPassword;
  res.json(req.user);
}

function updateMe(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  const allowedProps = ['displayName', 'data', 'identities', 'email'];
  let update = { $set: {} };

  allowedProps.forEach(prop => {
    if (req.body[prop]) {
      update.$set[prop] = req.body[prop];
    }
  });

  req.db
    .collection('__users__')
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
  let update = { $set: {} };

  for (const [key, value] of Object.entries(req.body)) {
    if (allowedProps.filter(prop => key.startsWith(prop)).length && !!value) {
      update.$set[key] = value;
    }
  }

  req.db
    .collection('__users__')
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
    .collection('__users__')
    .insertOne(insert)
    .then(insertResult => {
      res.json({ _id: insertResult.insertedId, ...insert });
    });
}

function getProviders(req, res) {
  let ret = [];
  Object.entries(req.authProviders).map(([name, provider]) => {
    ret.push({
      name: name,
      title: provider.title,
      buttonStyle: provider.buttonStyle,
      scope: provider.scope
    });
  });

  ret.sort((a, b) => a.order - b.order);
  res.json(ret);
}

function callback(req, res) {
  const { redirectURI } = state.get(req);
  // noinspection JSUnresolvedFunction
  passport.authenticate(req.authProvider.name, {
    session: false,
    failWithError: true
  })(req, res, () => {
    if (!req.user) {
      return redirectWithError(
        req,
        res,
        new Error('unable to authentify user')
      );
    }
    if (!redirectURI) {
      try {
        res.json({ token: req.authBearerToken });
      } catch (err) {
        debug('Catching headers', err);
      }
    } else {
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

function redirectWithError(req, res, err) {
  const { redirectURI } = state.get(req);
  if (!redirectURI) {
    helpers.error(res, err);
  } else {
    res.redirect(
      editURL(redirectURI, obj => {
        obj.query.error = true;
      })
    );
  }
}

function getUserFilterFromQuery(query) {
  let filter = {};
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
        .collection('__users__')
        .find(getUserFilterFromQuery(req.query), {
          projection: { 'identities.local.encryptedPassword': 0 }
        })
        .toArray();
      return res.json(users);
    } catch (err) {
      return redirectWithError(req, res, err);
    }
  } else {
    redirectWithError(
      req,
      res,
      new Error('Only admin users are allowed to show users')
    );
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
    let { update, updateToken } = builder.genUpdate(
      { name: 'impersonatingByAdmin' },
      {}
    );
    req.db
      .collection('__users__')
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
    redirectWithError(
      req,
      res,
      new Error('Only admin users are allowed to show users')
    );
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

function inviteUser(req, res) {
  if (!req.user) {
    return helpers.unauthorized(
      res,
      new Error('You must be authentified to send an invitation')
    );
  }
  const invitationToken = builder.genBearerToken(100);
  const dispatchInvitationEvent = function(payload) {
    req.service.emit('invitation/created', payload);
  };
  const filter = {
    email: new RegExp(
      '^' + req.body.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
      'i'
    )
  };
  const update = { $set: { updatedAt: new Date() } };

  const groups = req?.query?.groups
    ? getValidGroupsFromString(req.query.groups)
    : [];

  if (!!groups.length) {
    update.$addToSet = { groups: { $each: groups } };
  }
  // if user exists with the given email, we return the id
  req.db
    .collection('__users__')
    .findOneAndUpdate(
      filter,
      update,
      { returnDocument: 'after' },
      (err, result) => {
        if (err) {
          return helpers.error(res, err);
        }
        if (result.value) {
          const doc = result.value;
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
          const invitationToken = builder.genBearerToken(100);
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

          const { insert, insertToken } = builder.genInsert(provider, profile);
          if (!!groups.length) {
            insert.groups = groups;
          }
          req.db.collection('__users__').insertOne(insert, (err, result) => {
            if (err) {
              return helpers.error(res, err);
            }
            res.json({ id: result.insertedId, insertToken, invitationToken });
            dispatchInvitationEvent({
              id: result.insertedId,
              email: profile.email,
              invitedBy: req.user._id,
              token: invitationToken
            });
          });
        }
      }
    );
}

function acceptInvitation(req, res) {
  if (!req.user) {
    return helpers.unauthorized(
      res,
      new Error('You must be authentified to accept an invitation')
    );
  }
  const query = {
    [`identities.invitation-${req.params.invitationToken}.token.expiration`]: {
      $gt: new Date()
    }
  };
  req.db.collection('__users__').findOneAndUpdate(
    query,
    {
      $unset: { [`identities.invitation-${req.params.invitationToken}`]: true }
    },
    {
      returnDocument: 'before'
    },
    (err, updateResult) => {
      if (err) return helpers.error(res, err);
      const doc = updateResult.value;
      if (!doc) {
        debug('No user was found nor updated in query', query);
        return helpers.notFound(
          res,
          new Error('No user was found with this invitation token')
        );
      }
      const invitation =
        doc.identities[`invitation-${req.params.invitationToken}`];
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
    }
  );
}

function addGroupsToUser(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  if (!req?.params?.groups) {
    return helpers.missingParameters(
      res,
      new Error('groups must be specified')
    );
  }

  const groups = getValidGroupsFromString(req.params.groups);

  if (!groups.length) {
    return helpers.badRequest(
      res,
      new Error('groups contain invalid object Id(s)')
    );
  }

  const update = { $addToSet: { groups: { $each: groups } } };

  req.db
    .collection('__users__')
    .findOneAndUpdate({ _id: req.user._id }, update, {
      returnDocument: 'after'
    })
    .then(result => res.json(result.value))
    .catch(error => helpers.error(res, error));
}

module.exports = {
  initAuth,
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
  addGroupsToUser
};
