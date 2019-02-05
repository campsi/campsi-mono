const helpers = require('campsi/lib/modules/responseHelpers');
const builder = require('./modules/queryBuilder');
const forIn = require('for-in');
const passport = require('passport');
const editURL = require('edit-url');
const state = require('./state');
const debug = require('debug')('campsi:service:auth');
const ObjectID = require('mongodb').ObjectID;

function logout (req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  let update = {$set: {token: 'null'}};
  req.db.collection('__users__')
    .findOneAndUpdate({_id: req.user._id}, update).then(() => {
      return res.json({message: 'signed out'});
    }).catch((error) => {
      return helpers.error(res, error);
    });
}

function me (req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }
  res.json(req.user);
}

function updateMe (req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  const allowedProps = ['displayName', 'data'];
  let update = {$set: {}};

  allowedProps.forEach(prop => {
    if (req.body[prop]) {
      update.$set[prop] = req.body[prop];
    }
  });

  req.db.collection('__users__')
    .findOneAndUpdate({_id: req.user._id}, update, {returnOriginal: false})
    .then(result => res.json(result.value))
    .catch(error => helpers.error(res, error));
}

function createAnonymousUser (req, res) {
  const token = builder.genBearerToken(100);
  const insert = {
    identities: {},
    tokens: {[token.value]: {expiration: token.expiration, grantedByProvider: 'anonymous'}},
    email: token.value,
    token: token.value,
    createdAt: new Date()
  };
  req.db.collection('__users__').insertOne(insert).then(insertResult => {
    res.json(insertResult.ops[0]);
  });
}

function getProviders (req, res) {
  let ret = [];
  forIn(req.authProviders, (provider, name) => {
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

function callback (req, res) {
  const {redirectURI} = state.get(req);
  // noinspection JSUnresolvedFunction
  passport.authenticate(req.authProvider.name, {session: false, failWithError: true})(req, res, () => {
    if (!req.user) {
      return redirectWithError(req, res, new Error('unable to authentify user'));
    }
    if (!redirectURI) {
      try {
        res.json({token: req.authBearerToken});
      } catch (err) {
        debug('Catching headers', err);
      }
    } else {
      res.redirect(
        editURL(redirectURI, (obj) => {
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

function redirectWithError (req, res, err) {
  const {redirectURI} = state.get(req);
  if (!redirectURI) {
    helpers.error(res, err);
  } else {
    res.redirect(
      editURL(redirectURI, (obj) => {
        obj.query.error = true;
      })
    );
  }
}

function getUserFilterFromQuery (query) {
  let filter = {};
  if (query.provider) {
    filter[`providers.${query.provider}`] = {$exists: true};
  }
  if (query.email) {
    filter.email = query.email;
  }
  if (query.userId) {
    try {
      filter._id = new ObjectID(query.userId);
    } catch (e) {
      debug('erroneous ObjectID', query.userId);
      return { _id: null };
    }
  }
  return filter;
}
function getUsers (req, res) {
  if (req.user && req.user.isAdmin) {
    req.db.collection('__users__').find(getUserFilterFromQuery(req.query), (err, result) => {
      if (err) {
        return redirectWithError(req, res, err);
      }
      result.toArray().then(users => res.json(users));
    });
  } else {
    redirectWithError(req, res, new Error('Only admin users are allowed to show users'));
  }
}

function getAccessTokenForUser (req, res) {
  if (req.user && req.user.isAdmin) {
    let userId;
    try {
      userId = new ObjectID(req.params.userId);
    } catch (e) {
      return redirectWithError(req, res, new Error('Erroneous userId'));
    }
    let {update, updateToken} = builder.genUpdate({name: 'impersonatingByAdmin'}, {});
    req.db.collection('__users__').findOneAndUpdate({_id: userId}, update, {returnOriginal: false})
      .then((result) => {
        if (result.value) {
          res.json({token: updateToken.value});
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
function initAuth (req, res, next) {
  const params = {
    session: false,
    state: state.serialize(req),
    scope: req.authProvider.scope
  };
  debug(params);
  // noinspection JSUnresolvedFunction
  passport.authenticate(
    req.params.provider,
    params
  )(req, res, next);
}

function inviteUser (req, res) {
  if (!req.user) {
    return helpers.unauthorized(res, new Error('You must be authentified to send an invitation'));
  }
  const invitationToken = builder.genBearerToken(100);
  const dispatchInvitationEvent = function (payload) {
    req.service.emit('invitation/created', payload);
  };
  // if user exists with the given email, we return the id
  req.db.collection('__users__').findOne({email: req.body.email}, {}, (err, doc) => {
    if (err) {
      return helpers.error(res, err);
    }
    if (doc) {
      res.json({id: doc._id.toString(), invitationToken});
      return dispatchInvitationEvent({
        id: doc._id,
        email: doc.email,
        invitedBy: req.user,
        token: invitationToken,
        requestBody: req.body,
        requestHeaders: req.headers
      });
    } else {
      const invitationToken = builder.genBearerToken(100);
      const provider = {name: `invitation-${invitationToken.value}`, expiration: 20};
      const profile = {
        email: req.body.email,
        displayName: req.body.displayName,
        identity: {
          invitedBy: req.user._id,
          token: invitationToken,
          data: req.body.data
        }
      };
      const {insert, insertToken} = builder.genInsert(provider, profile);
      req.db.collection('__users__').insertOne(insert, (err, result) => {
        if (err) {
          return helpers.error(res, err);
        }
        res.json({id: result.insertedId, insertToken, invitationToken});
        dispatchInvitationEvent({
          id: result.insertedId,
          email: profile.email,
          invitedBy: req.user,
          token: invitationToken
        });
      });
    }
  });
}

function acceptInvitation (req, res) {
  if (!req.user) {
    return helpers.unauthorized(res, new Error('You must be authentified to accept an invitation'));
  }
  const query = {
    [`identities.invitation-${req.params.invitationToken}.token.expiration`]: {
      $gt: new Date()
    }
  };
  req.db.collection('__users__').findOneAndUpdate(query, {
    $unset: {[`identities.invitation-${req.params.invitationToken}`]: true}
  }, {
    returnOriginal: true
  }, (err, updateResult) => {
    if (err) return helpers.error(res, err);
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
    // Cleanup invitation
    if (typeof doc.identities[0] === 'undefined') {
      req.db.collection('__users__').deleteOne({_id: doc._id}, (err) => {
        if (err) debug('error while deleting user', doc._id);
      });
    }
  });
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
  createAnonymousUser,
  logout,
  inviteUser,
  acceptInvitation
};
