const debug = require('debug')('campsi:auth:tokens');

async function deleteExpiredTokens(tokens, userId, db) {
  try {
    const validTokens = {};
    const expiredTokensLog = [];

    if (Object.entries(tokens).length === 0) {
      return;
    }

    // iterate over users tokens
    if (Object.entries(tokens)) {
      for (const [key, token] of Object.entries(tokens)) {
        if (token.expiration > new Date()) {
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
          await db.collection('__users__.tokens_log').insertMany(expiredTokensLog);
        } catch (ex) {
          debug(ex);
        }
      }

      if (Object.entries(tokens.length !== Object.entries(validTokens).length)) {
        await db
          .collection('__users__')
          .updateOne({ _id: userId }, { $set: { tokens: validTokens } }, { returnDocument: 'after' });
      }
    }
  } catch (e) {
    debug(e);
  }
}

module.exports = {
  deleteExpiredTokens
};
