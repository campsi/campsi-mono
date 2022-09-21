const debug = require('debug')('campsi:auth:tokens');

async function deleteExpiredTokens(user, db) {
  try {
    const validTokens = {};
    const expiredTokensLog = [];

    // iterate over users tokens
    if (user.tokens) {
      for (const [key, token] of Object.entries(user.tokens)) {
        if (token.expiration > new Date()) {
          validTokens[`${token}`] = token;
        } else {
          expiredTokensLog.push({
            userId: user._id,
            token
          });
        }
      }

      if (expiredTokensLog.length) {
        await db.collection('__users__.tokens_log').insertMany(expiredTokensLog);
      }
      if (Object.entries(user.tokens).length !== Object.entries(validTokens).length) {
        await db.collection('__users__').updateOne({ _id: user._id }, { $set: { tokens: validTokens } });
      }
    }
  } catch (e) {
    debug(e);
  }
}

module.exports = {
  deleteExpiredTokens
};
