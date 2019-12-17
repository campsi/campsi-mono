#!/usr/bin/env node
const argv = require('yargs').argv;
const authKey = argv.authServiceConfigKey || 'auth';
const email = argv.email;
const debug = require('debug')('campsi-service-auth:debugger');
const CryptoJS = require('crypto-js');
const bcrypt = require('bcryptjs');
const config = require('config');
const CampsiServer = require('campsi');
const campsi = new CampsiServer(config.campsi);

function comparePassword (test, encrypted) {
  return new Promise((resolve, reject) => {
    bcrypt.compare(test, encrypted, function (err, isMatch) {
      if (err) {
        reject(err);
      }
      resolve(isMatch);
    });
  });
}

campsi.dbConnect().then(() => {
  const collectionName = config.services['auth'].options.collectionName || '__users__';
  const collection = campsi.db.collection(collectionName);
  const authConfig = config.services[authKey].options;
  const salt = authConfig.providers.local.options.salt;
  collection.findOne({
    $or: [
      {email: email},
      {'identities.local.username': email}
    ]
  }).then(user => {
    if (!user) {
      debug('user not found');
      process.exit();
    }
    debug('found user', user._id);
    const decrypted = CryptoJS.AES.decrypt(user.identities.local.password, salt).toString(CryptoJS.enc.Utf8);
    const encrypted = user.identities.local.encryptedPassword;
    debug('decrypted password', decrypted);
    debug('last user token', user.token);
    if (typeof user.tokens === 'object') {
      debug('user tokens', Object.keys(user.tokens));
    } else {
      debug('user tokens is not an object', user.tokens);
    }

    comparePassword(decrypted, encrypted)
      .then(isMatch => {
        debug(isMatch ? 'bcrypt decrypted password MATCH' : 'bcrypt decrypted password DO NOT MATCH');
        return (argv.password) ? comparePassword(argv.password, encrypted) : null;
      })
      .then(isMatch => {
        debug(isMatch ? 'bcrypt input password MATCH' : 'bcrypt input password DO NOT MATCH');
      })
      .then(() => {
        process.exit();
      });

    if (user.identities.local && user.identities.local.passwordResetToken) {
      debug('user tried to reset its password', user.identities.local.passwordResetToken);
    }
  }).catch(err => {
    debug('err', err);
    process.exit();
  });
});
