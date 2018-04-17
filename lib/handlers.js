const helpers = require('campsi/lib/modules/responseHelpers');
const builder = require('./modules/queryBuilder');
const forIn = require('for-in');
const passport = require('passport');
const editURL = require('edit-url');
const state = require('./state');
const debug = require('debug')('campsi:service:auth');

function logout (req, res) {
  if (!req.user) {
    return helpers.serviceNotAvailable(res);
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
    return helpers.serviceNotAvailable(res);
  }
  res.json(req.user);
}

function updateMe (req, res) {
  if (!req.user) {
    return helpers.serviceNotAvailable(res);
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
      return redirectWithError(req, res, 'unable to authentify user');
    }
    if (!redirectURI) {
      res.json({token: req.authBearerToken});
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
    helpers.error(res, {error: true, message: err});
  } else {
    res.redirect(
      editURL(redirectURI, (obj) => {
        obj.query.error = true;
      })
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
function initAuth (req, res, next) {
  const params = {
    session: false,
    state: state.serialize(req),
    scope: req.authProvider.scope
  };

    // noinspection JSUnresolvedFunction
  passport.authenticate(
    req.params.provider,
    params
  )(req, res, next);
}

module.exports = {
  initAuth,
  redirectWithError,
  callback,
  getProviders,
  me,
  updateMe,
  createAnonymousUser,
  logout
};
