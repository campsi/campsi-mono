const debug = require('debug')('campsi:auth:tokens');
const { getUsersCollectionName } = require('./modules/collectionNames');

async function deleteExpiredTokens(tokens, userId, db, providersToRemove = []) {
  try {
    const validTokens = {};
    const expiredTokensLog = [];

    if (Object.entries(tokens).length === 0) {
      return;
    }

    // iterate over users tokens
    for (const [key, token] of Object.entries(tokens)) {
      if (token.expiration > new Date() && !providersToRemove.includes(token.provider)) {
        validTokens[`${key}`] = token;
      } else {
        expiredTokensLog.push({
          userId,
          token: key,
          ...token
        });
      }
    }

    if (expiredTokensLog.length) {
      try {
        await db.collection(`${getUsersCollectionName()}.tokens_log`).insertMany(expiredTokensLog);
      } catch (ex) {
        debug(ex);
      }
    }

    if (Object.entries(tokens).length !== Object.entries(validTokens).length) {
      await db
        .collection(getUsersCollectionName())
        .updateOne({ _id: userId }, { $set: { tokens: validTokens } }, { returnDocument: 'after' });
    }
  } catch (e) {
    debug(e);
  }
}

module.exports = {
  deleteExpiredTokens
};
