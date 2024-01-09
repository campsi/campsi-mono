const CryptoJS = require('crypto-js');
const handlers = require('./handlers');
const helpers = require('../../../lib/modules/responseHelpers');
const state = require('./state');
const bcrypt = require('bcryptjs');
const { getUsersCollectionName } = require('./modules/collectionNames');
const { isEmailValid } = require('./handlers');
const editURL = require('edit-url');
const debug = require('debug')('campsi:auth:local');

function getMissingParameters(payload, parameters) {
  return parameters.filter(paramName => typeof payload[paramName] === 'undefined');
}

function dispatchUserSignupEvent(req, user) {
  req.service.emit('signup', {
    id: user._id,
    email: user.email,
    username: user.displayName, // todo: replace displayName by email
    firstname: user.firstname,
    lastname: user.lastname,
    token: user.identities.local.validationToken,
    data: user.data,
    authProvider: 'local',
    requestBody: req.body,
    requestHeaders: req.headers,
    invitedBy: user.invitedBy
  });
}

module.exports.middleware = function (localProvider) {
  return (req, res, next) => {
    req.authProvider = localProvider;
    state.serialize(req);
    next();
  };
};

module.exports.signin = function (req, res, next) {
  // could be a one-liner, but I find this more explicit
  // the real signin method is the callback below
  return handlers.callback(req, res, next);
};

/**
 * This method is responsible of authentificating the user based on the username
 * and password passed in arguments
 * Added 2020-11-16: email is case insensitive, but username still is.
 * @param req
 * @param username
 * @param password
 * @param done
 */
module.exports.callback = function localCallback(req, username, password, done) {
  const filter = {
    $or: [
      {
        email: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
      },
      { 'identities.local.username': username }
    ]
  };
  req.db
    .collection(getUsersCollectionName())
    .findOne(filter)
    .then(user => {
      if (!user) {
        debug('tried to find user with username', username, 'but none found');
        done(null, null);
      }
      debug('signin passport callback', username, user.identities.local.encryptedPassword, filter);
      bcrypt.compare(password, user.identities.local.encryptedPassword, function (err, isMatch) {
        if (err) {
          debug('bcrypt password compare error', err, password, user.identities.local.encryptedPassword);
        }
        if (isMatch) {
          user.identity = user.identities.local;

          return done(null, user);
        } else {
          done(null, null);
        }
      });
    })
    .catch(done);
};

module.exports.encryptPassword = function (password, saltRounds) {
  function byteLength(str) {
    // returns the byte length of an utf8 string
    let s = str.length;
    for (let i = str.length - 1; i >= 0; i--) {
      const code = str.charCodeAt(i);
      if (code > 0x7f && code <= 0x7ff) s++;
      else if (code > 0x7ff && code <= 0xffff) s += 2;
      if (code >= 0xdc00 && code <= 0xdfff) i--; // trail surrogate
    }
    return s;
  }

  return new Promise((resolve, reject) => {
    if (byteLength(password) > 72) {
      reject(new Error('Password byte length must not exceed 72 bytes'));
    }
    bcrypt.genSalt(saltRounds || 2, function (err, generatedSalt) {
      if (err) return reject(err);
      bcrypt.hash(password, generatedSalt, function (err, hash) {
        if (err) return reject(err);
        resolve(hash);
      });
    });
  });
};

module.exports.createRandomToken = function (username, salt) {
  return CryptoJS.AES.encrypt(new Date().toISOString() + username, salt).toString();
};

module.exports.signup = function (req, res) {
  const salt = req.authProvider.options.salt;
  const passwordRegex = new RegExp(req.authProvider.options.passwordRegex ?? '.*');
  if (!passwordRegex.test(req.body.password)) {
    return helpers.error(
      res,
      new Error(`Invalid password, please respect this regex : ${req.authProvider.options.passwordRegex}`)
    );
  }
  const users = req.db.collection(getUsersCollectionName());
  // todo : required firstname and lastname when all the frontends are ready
  if (!req.body.displayName && (!req.body.firstname || !req.body.lastname)) {
    return helpers.error(res, new Error('missing parameters : displayName or firstname and lastname'));
  }

  const missingParameters = ['password', 'username'].filter(prop => {
    return typeof req.body[prop] === 'undefined' || req.body.prop === '';
  });
  if (missingParameters.length > 0) {
    return helpers.error(res, new Error(`missing parameters : ${missingParameters.join(', ')}`));
  }

  const insertUser = function (user) {
    return new Promise((resolve, reject) => {
      users
        .insertOne(user)
        .then(result => resolve(Object.assign({}, user, { _id: result.insertedId })))
        .catch(err => {
          reject(err);
        });
    });
  };
  const updateInvitedUser = async function (user, invitationToken) {
    try {
      delete user.identities.local.validationToken;
      user.identities.local.validated = true;
      const update = {
        $set: {
          'identities.local': user.identities.local,
          email: user.email,
          displayName: user.displayName,
          firstname: user.firstname,
          lastname: user.lastname,
          data: user.data,
          updatedAt: new Date()
        }
      };
      if (invitationToken) {
        update.$unset = { [`identities.invitation-${invitationToken}`]: true };
      }
      const result = await users.findOneAndUpdate({ email: user.email }, update, { returnDocument: 'after' });
      return result.value;
    } catch (err) {
      throw new Error('could not perform findOneAndUpdate');
    }
  };

  const doesUserExist = async function (user) {
    try {
      return await users.findOne({ email: user.email });
    } catch (e) {
      throw new Error('could not perform findOneAndUpdate');
    }
  };

  if (req.body.email) {
    if (!isEmailValid(req.body.email)) {
      return helpers.error(res, new Error('Invalid email'));
    }
  }
  const email = String(req.body.email || req.body.username).toLowerCase();
  module.exports
    .encryptPassword(req.body.password)
    .then(async encryptedPassword => {
      const user = {
        displayName: req.body.displayName,
        firstname: req.body.firstname,
        lastname: req.body.lastname,
        email,
        data: req.body.data,
        createdAt: new Date(),
        identities: {
          local: {
            id: req.body.username,
            username: req.body.username,
            encryptedPassword,
            validated: false,
            validationToken: module.exports.createRandomToken(req.body.username, salt)
          }
        }
      };

      try {
        let insertedOrUpdatedUser;
        const existingUser = await doesUserExist(user);
        if (existingUser) {
          const availableProviders = req.authProviders;
          const existingProvidersIdentities = Object.entries(existingUser.identities)
            .filter(([key, value]) => !!availableProviders[key] && !!value.id)
            .map(([key, value]) => key);

          if (existingProvidersIdentities.length) {
            return helpers.badRequest(res, new Error('A user already exists with that email'));
          }

          // user has been created, through invitation, but doesn't have any identity provider => we can update it
          const invitationToken = req.body.invitationToken;
          insertedOrUpdatedUser = await updateInvitedUser(user, invitationToken);

          if (existingUser.identities?.[`invitation-${invitationToken}`]) {
            const invitation = existingUser.identities[`invitation-${invitationToken}`];
            const payload = {
              userId: insertedOrUpdatedUser._id,
              invitedUserId: insertedOrUpdatedUser._id,
              invitedBy: invitation.invitedBy,
              data: invitation.data,
              requestHeaders: req.headers
            };
            req.service.emit('invitation/accepted', payload);
          }
        } else {
          insertedOrUpdatedUser = await insertUser(user);
        }
        handlers.callback(req, res);

        return dispatchUserSignupEvent(req, insertedOrUpdatedUser);
      } catch (err) {
        handlers.redirectWithError(req, res, err);
      }
    })
    .catch(passwordEncryptionError => {
      debug('Password encryption error', passwordEncryptionError);
      return helpers.error(res, new Error('password encryption error'));
    });
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
module.exports.validate = async function (req, res) {
  if (!req.query.token) {
    return helpers.error(res, new Error('you must provide a validation token'));
  }

  try {
    const result = await req.db.collection(getUsersCollectionName()).findOneAndUpdate(
      { 'identities.local.validationToken': req.query.token },
      {
        $set: { 'identities.local.validated': true },
        $unset: { 'identities.local.validationToken': '' }
      },
      { returnDocument: 'after' }
    );
    const redirectURI = req.query.redirectURI;
    if (result.value) {
      req.service.emit('local/validated', {
        user: result.value,
        requestBody: req.body,
        requestHeaders: req.headers
      });
      req.user = result.value;
      debug('user validated', result.value);
      if (redirectURI) {
        return res.redirect(301, redirectURI);
      }
      res.json({ error: false, message: 'User is validated' });
    } else {
      if (redirectURI) {
        return res.redirect(
          editURL(redirectURI, obj => {
            obj.query.error = 'Validation Token not found';
          })
        );
      }
      helpers.notFound(res, new Error('Validation Token not found'));
    }
  } catch (err) {
    helpers.error(res, err);
  }
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
module.exports.createResetPasswordToken = async (req, res) => {
  const missingParams = getMissingParameters(req.body, ['email']);
  if (missingParams.length > 0) {
    return helpers.error(res, new Error(`missing parameter(s) : ${missingParams.join(', ')}`));
  }
  try {
    const user = await req.db.collection(getUsersCollectionName()).findOne({
      email: new RegExp('^' + req.body.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
    });
    if (!user) {
      return helpers.notFound(res, new Error('User not found'));
    }

    if (!user.identities?.local?.id) {
      return helpers.forbidden(res, new Error('user does not have a local identity provider'));
    }
    const opts = req.authProvider.options;

    await this.updateUserWithPasswordResetToken(user, opts, req.db, req.service, req.body, req.headers);

    return res.json({ success: true });
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
};

/**
 * For the given user, update its passwordResetToken, then emit an event
 * @param {object} user
 * @param {object} options
 * @param {number?} [options.resetPasswordTokenExpiration] int
 * @param {string} options.salt
 * @param {object} db
 * @param {object} service
 * @param {object} body
 * @param {object} headers
 */
module.exports.updateUserWithPasswordResetToken = async (user, options, db, service, body = {}, headers = {}) => {
  const expirationDate = new Date();
  const exp = options.resetPasswordTokenExpiration || 10;
  expirationDate.setTime(expirationDate.getTime() + exp * 86400000);

  const token = this.createRandomToken(user.email, options.salt);
  const out = await db.collection(getUsersCollectionName()).findOneAndUpdate(
    { _id: user._id },
    {
      $set: {
        'identities.local.passwordResetToken': {
          value: token,
          expiration: expirationDate
        }
      }
    },
    { returnDocument: 'after' }
  );
  service.emit('local/passwordResetTokenCreated', {
    user: out.value,
    requestBody: body,
    requestHeaders: headers
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
  const missingParams = getMissingParameters(req.body, ['password', 'token']);
  const passwordRegex = new RegExp(req.authProvider.options.passwordRegex ?? '.*');
  if (!passwordRegex.test(req.body.password)) {
    return helpers.error(
      res,
      new Error(`Invalid password, please respect this regex : ${req.authProvider.options.passwordRegex}`)
    );
  }
  if (missingParams.length > 0) {
    return helpers.error(res, new Error(`missing parameter(s) : ${missingParams.join(', ')}`));
  }
  module.exports
    .encryptPassword(req.body.password)
    .then(function (encryptedPassword) {
      const filter = {
        'identities.local.passwordResetToken.value': req.body.token,
        'identities.local.passwordResetToken.expiration': { $gt: new Date() }
      };
      const update = {
        $set: {
          'identities.local.encryptedPassword': encryptedPassword,
          tokens: {}
        },
        $unset: {
          token: '',
          passwordResetToken: ''
        }
      };
      req.db
        .collection(getUsersCollectionName())
        .findOneAndUpdate(filter, update)
        .then(result => {
          if (!result.value) {
            throw new Error('wrong reset token');
          }
          // we set the username as a param because if the update succeeds,
          // the request is forwarded to the passport local callback and will
          // authorize the user with the new password
          req.body.username = result.value.identities.local.username || result.value.email;
          return handlers.callback(req, res);
        })
        .catch(err => handlers.redirectWithError(req, res, err));
    })
    .catch(passwordEncryptionError => {
      debug('Could not encrypt password', passwordEncryptionError);
      helpers.error({
        error: true,
        message: 'an error occurred while encrypting the password specified'
      });
    });
};

/**
 * Update the password for the current login user
 *
 * @param req
 * @param res
 * @return {*}
 */
module.exports.updatePassword = function (req, res) {
  const missingParams = getMissingParameters(req.body, ['new', 'confirm']);
  const passwordRegex = new RegExp(req.authProvider.options.passwordRegex ?? '.*');
  if (!passwordRegex.test(req.body.new)) {
    return helpers.error(
      res,
      new Error(`Invalid password, please respect this regex : ${req.authProvider.options.passwordRegex}`)
    );
  }
  if (missingParams.length > 0) {
    return helpers.error(res, new Error(`missing parameter(s) : ${missingParams.join(', ')}`));
  }

  if (req.body.new !== req.body.confirm) {
    return helpers.error(res, new Error('new and confirmation password do not match'));
  }

  module.exports
    .encryptPassword(req.body.new)
    .then(encryptedPassword => {
      const filter = {
        _id: req.user._id
      };

      const update = {
        $set: {
          'identities.local.encryptedPassword': encryptedPassword,
          tokens: {}
        },
        $unset: { token: '' }
      };

      req.db
        .collection(getUsersCollectionName())
        .findOneAndUpdate(filter, update)
        .then(() => {
          return res.json({ success: true });
        })
        .catch(err => {
          return helpers.error(res, err);
        });
    })
    .catch(passwordEncryptionError => {
      debug('Could not encrypt password', passwordEncryptionError);
      helpers.error({
        error: true,
        message: 'an error occurred while encrypting the new password'
      });
    });
};
