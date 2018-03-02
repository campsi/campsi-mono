const CryptoJS = require('crypto-js');
const handlers = require('./handlers');
const helpers = require('campsi/lib/modules/responseHelpers');
const state = require('./state');

function testPassword (provider, user, password) {
  const decrypted = CryptoJS.AES.decrypt(
    user.identities.local.password,
    provider.options.salt
  ).toString(CryptoJS.enc.Utf8);
  return password === decrypted;
}

function getMissingParameters (payload, parameters) {
  return parameters.filter(paramName => (typeof payload[paramName] === 'undefined'));
}

function dispatchUserSignupEvent (req, user) {
  req.service.emit('local/signup', {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    token: user.identities.local.validationToken,
    data: user.data
  });
}

module.exports.middleware = function (localProvider) {
  return (req, res, next) => {
    req.authProvider = localProvider;
    state.serialize(req);
    next();
  };
};

module.exports.signin = function (req, res) {
  // could be a one-liner, but I find this more explicit
  return handlers.callback(req, res);
};

module.exports.encryptPassword = function (password, salt) {
  return CryptoJS.AES.encrypt(password, salt).toString();
};

module.exports.createRandomToken = function (username, salt) {
  return CryptoJS.AES.encrypt(new Date().toISOString() + username, salt).toString();
};

module.exports.signup = function (req, res) {
  const salt = req.authProvider.options.salt;
  const users = req.db.collection('__users__');

  const missingParameters = ['password', 'displayName', 'username'].filter((prop) => {
    return (typeof req.body[prop] === 'undefined' || req.body.prop === '');
  });

  if (missingParameters.length > 0) {
    return helpers.error(res, {
      error: true,
      message: 'missing parameters',
      details: missingParameters
    });
  }

  let user = {
    displayName: req.body.displayName,
    email: req.body.email || req.body.username,
    data: req.body.data,
    createdAt: new Date(),
    identities: {
      local: {
        id: req.body.username,
        username: req.body.username,
        password: module.exports.encryptPassword(req.body.password, salt),
        validated: false,
        validationToken: module.exports.createRandomToken(req.body.username, salt)
      }
    }
  };

  if (req.user) {
    users.findOneAndUpdate({_id: req.user._id}, {
      $set: {
        'identities.local': user.identities.local,
        email: user.email,
        data: Object.assign({}, req.user.data || {}, user.data || {}),
        updatedAt: new Date()
      }
    })
      .then(() => handlers.callback(req, res))
      .catch((err) => handlers.redirectWithError(req, res, err));
  } else {
    users.insertOne(user)
      .then(() => handlers.callback(req, res))
      .then(() => dispatchUserSignupEvent(req, user))
      .catch((err) => handlers.redirectWithError(req, res, err));
  }
};

/**
 * Search the user that matches the validationToken
 * if found, it's marked as validated. Request is redirected
 * to the specified redirectURI.
 *
 * @param {request} req
 * @param {string} req.query.token
 * @param {string} req.query.redirectURI
 * @param {*} res
 */
module.exports.validate = function (req, res) {
  if (!req.query.token || !req.query.redirectURI) {
    return helpers.error(res, {message: 'bad request'});
  }

  req.db.collection('__users__').findOneAndUpdate(
    {'identities.local.validationToken': req.query.token},
    {
      $set: {'identities.local.validated': true},
      $unset: {'identities.local.validationToken': ''}
    },
    {returnOriginal: false}
  ).then(result => {
    if (result.value) {
      res.redirect(301, req.query.redirectURI);
      req.service.emit('local/validated', result.value);
    } else {
      helpers.notFound(res, {message: 'Validation Token not found'});
    }
  }).catch(err => {
    helpers.error(res, err);
  });
};

/**
 * For the record that matches identities.local.username for the given "email" in request body,
 * create a passwordResetToken with a value and expiration, that will sent as an internal event.
 *
 * It is important that this token does not go in the response, or anyone could generate token for anybody
 *
 * @param req
 * @param res
 * @return {*}
 */
module.exports.createResetPasswordToken = function (req, res) {
  const missingParams = getMissingParameters(req.body, ['email']);
  if (missingParams.length > 0) {
    return helpers.error(res, {message: `missing parameter(s) : ${missingParams.join(', ')}`});
  }
  const opts = req.authProvider.options;

  let expirationDate = new Date();
  let exp = opts.resetPasswordTokenExpiration || 10;
  expirationDate.setTime(expirationDate.getTime() + exp * 86400000);

  const token = module.exports.createRandomToken(req.body.email, opts.salt);

  req.db.collection('__users__').findOneAndUpdate(
    {'identities.local.username': req.body.email},
    {
      $set: {
        'identities.local.passwordResetToken': {
          value: token,
          expiration: expirationDate
        }
      },
      $unset: {
        'token': ''
      }
    }, {
      returnOriginal: false
    }
  ).then(out => {
    req.service.emit('local/passwordResetTokenCreated', out.value);
    return res.json({success: true});
  }).catch(err => {
    return helpers.error(res, err);
  });
};

/**
 * Find the user with a non-expirated passwordResetToken
 * then updates its password with the given password
 *
 * @param req
 * @param res
 * @return {*}
 */
module.exports.resetPassword = function (req, res) {
  const missingParams = getMissingParameters(req.body, ['password', 'token', 'username']);

  if (missingParams.length > 0) {
    return helpers.error(res, {message: `missing parameter(s) : ${missingParams.join(', ')}`});
  }

  const localProvider = req.authProvider;
  const encryptedPassword = CryptoJS.AES.encrypt(
    req.body.password,
    localProvider.options.salt
  ).toString();

  const filter = {
    'identities.local.passwordResetToken.value': req.body.token,
    'identities.local.passwordResetToken.expiration': {$gt: new Date()}
  };

  const update = {$set: {'identities.local.password': encryptedPassword}, $unset: {'token': ''}};

  // we set the username as a param because the if the update succeeds,
  // the request is forwarded to the passport local callback and will
  // authorize the user with the new password

  req.db.collection('__users__').updateOne(filter, update)
    .then(() => handlers.callback(req, res))
    .catch((err) => handlers.redirectWithError(req, res, err));
};

/**
 * This method is responsible of authentificating the user based on the username
 * and password passed in arguments
 * @param req
 * @param username
 * @param password
 * @param done
 */
module.exports.callback = function localCallback (req, username, password, done) {
  let filter = {};
  filter['identities.local.username'] = username;
  req.db.collection('__users__').findOne(filter).then((user) => {
    if (user && testPassword(req.authProvider, user, password)) {
      user.identity = user.identities.local;
      return done(null, user);
    }
    done(null, null);
  }).catch(done);
};
