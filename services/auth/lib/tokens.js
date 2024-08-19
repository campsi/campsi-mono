const debug = require('debug')('campsi:auth:tokens');

/**
 *
 * @param {Object}  tokens
 * @param {import('mongodb').ObjectId}  userId
 * @param {import('mongodb').Db}  db
 * @param {array} [providersToRemove = []]
 * @param {import('mongodb').Collection}  usersCollection
 * @returns {Promise<void>}
 */
async function deleteExpiredTokens(tokens, userId, db, providersToRemove = [], usersCollection) {
  try {
    const validTokens = {};
    const expiredTokensLog = [];

    if (Object.entries(tokens).length === 0) {
      return;
    }

    // iterate over users tokens
    for (const [key, token] of Object.entries(tokens)) {
      if (!providersToRemove.includes(token.grantedByProvider)) {
        if (token.expiration > new Date() || token.doNotDelete) {
          validTokens[`${key}`] = token;
          continue;
        }
      }
      expiredTokensLog.push({
        userId,
        token: key,
        ...token
      });
    }

    if (expiredTokensLog.length) {
      try {
        await db.collection(`${usersCollection.collectionName}.tokens_log`).insertMany(expiredTokensLog);
      } catch (ex) {
        debug(ex);
      }
      await usersCollection.updateOne({ _id: userId }, { $set: { tokens: validTokens } }, { returnDocument: 'after' });
    }
  } catch (e) {
    debug(e);
  }
}

module.exports = {
  deleteExpiredTokens
};
