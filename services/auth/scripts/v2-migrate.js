/* eslint-disable no-process-exit */
const async = require('async');
const debug = require('debug')('campsi:auth:local:generateEncryptedPasswords');
const CryptoJS = require('crypto-js');
const { ObjectId } = require('mongodb');
const { encryptPassword } = require('../lib/local');

async function createEncryptedPassword(collection, salt, removeOldPassword, onComplete) {
  try {
    const users = collection.find({ 'identities.local.password': { $exists: true } }).toArray();
    let updates = await Promise.allSettled(
      users.map(async user => {
        const decrypted = CryptoJS.AES.decrypt(user.identities.local.password, salt).toString(CryptoJS.enc.Utf8);
        const encryptedPassword = encryptPassword(decrypted);
        const ops = { $set: { 'identities.local.encryptedPassword': encryptedPassword } };
        if (removeOldPassword) {
          ops.$unset = { password: '' };
        }
        return { filter: { _id: ObjectId(user._id) }, ops };
      })
    );
    updates = updates.filter(result => result.status === 'fulfilled').map(result => result.value);

    const results = await Promise.allSettled(
      updates.map(update => collection.updateOne(update.filter, update.ops, { bypassDocumentValidation: true }))
    );

    onComplete(results.filter(result => result.status === 'fulfilled').map(result => result.value));
  } catch (err) {
    debug(`received an error: ${err.message}`);
  }
}

async function createTokensProperty(collection, done) {
  try {
    const users = await collection.find({ 'token.expiration': { $gt: new Date() } }).toArray();
    await Promise.all(
      users.map(user =>
        collection.updateOne(
          { _id: user._id },
          {
            $set: {
              [`tokens.${user.token.value}`]: {
                expiration: user.token.expiration,
                grantedByProvider: user.identities.local ? 'local' : 'anonymous'
              }
            }
          }
        )
      )
    );
  } catch (err) {
    debug(`received an error: ${err.message}`);
  }
}

module.exports = createEncryptedPassword;

if (!process.argv[2]) {
  process.exit();
}

const path = require('path');
const { MongoClient } = require('mongodb');
const configPath = path.join(process.cwd(), process.argv[2]);
const config = require(configPath);

const authKey = process.argv[3] || 'auth';
const mongoUri = config.campsi.mongo.uri;
MongoClient.connect(mongoUri)
  .then(async client => {
    const db = client.db(config.campsi.mongo.database);
    const authConfig = config.services[authKey].options;
    const salt = authConfig.providers.local.options.salt;
    const collection = db.collection(authConfig.collectionName);
    await createEncryptedPassword(collection, salt, true, async result => {
      debug(JSON.stringify(result, null, 2));
      await createTokensProperty(collection);
      process.exit();
    });
  })
  .catch(err => debug(`received an error: ${err.message}`));
