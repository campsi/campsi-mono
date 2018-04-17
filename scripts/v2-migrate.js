const async = require('async');
const debug = require('debug')('campsi:auth:local:generateEncryptedPasswords');
const CryptoJS = require('crypto-js');
const {ObjectId} = require('mongodb');
const {encryptPassword} = require('../lib/local');

function createEncryptedPassword (collection, salt, removeOldPassword, onComplete) {
  let errors = [];
  let updates = [];
  collection.find({
    'identities.local.password': {'$exists': true}
  }).toArray((err, users) => {
    if (err) debug(`received an error: ${err.message}`);
    async.forEach(users, (user, cb) => {
      const decrypted = CryptoJS.AES.decrypt(user.identities.local.password, salt).toString(CryptoJS.enc.Utf8);
      encryptPassword(decrypted).then(encryptedPassword => {
        const ops = {$set: {'identities.local.encryptedPassword': encryptedPassword}};
        if (removeOldPassword) {
          ops.$unset = {'password': ''};
        }
        updates.push([{_id: ObjectId(user._id)}, ops]);
        cb();
      }).catch(err => {
        errors.push(err);
        cb();
      });
    }, () => {
      async.map(updates, (update, cb) => {
        collection.updateOne(update[0], update[1], {bypassDocumentValidation: true}, (err, cmdResult) => {
          cb(err, Object.assign({}, update[0], cmdResult.result));
        });
      }, (err, results) => {
        if (err) debug(`received an error: ${err.message}`);
        onComplete(results);
      });
    });
  });
}

function createTokensProperty (collection, done) {
  collection.find({'token.expiration': {$gt: new Date()}}).toArray((err, users) => {
    if (err) debug(`received an error: ${err.message}`);
    async.forEach(users, (user, cb) => {
      collection.updateOne({_id: user._id}, {
        $set: {
          [`tokens.${user.token.value}`]: {
            expiration: user.token.expiration,
            grantedByProvider: user.identities.local ? 'local' : 'anonymous'
          }
        }
      }, (err, cmdReturn) => {
        if (err) debug(`received an error: ${err.message}`);
        debug(cmdReturn.result);
        cb();
      });
    }, done);
  });
}

module.exports = createEncryptedPassword;

if (!process.argv[2]) {
  process.exit();
}

const path = require('path');
const {MongoClient} = require('mongodb');
const mongoUriBuilder = require('mongo-uri-builder');
const configPath = path.join(process.cwd(), process.argv[2]);
const config = require(configPath);

const authKey = process.argv[3] || 'auth';
const mongoUri = mongoUriBuilder(config.campsi.mongo);
MongoClient.connect(mongoUri, (err, client) => {
  if (err) debug(`received an error: ${err.message}`);
  const db = client.db(config.campsi.mongo.database);
  const authConfig = config.services[authKey].options;
  const salt = authConfig.providers.local.options.salt;
  const collection = db.collection(authConfig.collectionName);
  createEncryptedPassword(collection, salt, true, (result) => {
    debug(JSON.stringify(result, null, 2));
    createTokensProperty(collection, () => {
      process.exit();
    });
  });
});
