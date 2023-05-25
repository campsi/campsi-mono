const { getUsersCollectionName } = require('./modules/collectionNames');
const { deleteExpiredTokens } = require('./tokens');
const findCallback = require('./modules/findCallback');
const builder = require('./modules/queryBuilder');
const createError = require('http-errors');
/**
 * Intercepts passport callback
 * @param fn
 * @param args
 * @param done
 */
function proxyVerifyCallback(fn, args, done) {
  const { callback, index } = findCallback(args);
  args[index] = function (err, user) {
    done(err, user, callback);
  };
  fn.apply(null, args);
}

/**
 * Intercepts passport callbacks, insert or updates user in db
 * with profile info from provider and generates a new bearer token
 *
 * @param req
 */
module.exports = function passportMiddleware(req) {
  const db = req.db;
  const users = req.db.collection(getUsersCollectionName());
  const provider = req.authProvider;
  const availableProviders = req.authProviders;
  return proxyVerifyCallback(provider.callback, arguments, async function (err, profile, passportCallback) {
    if (!profile || err) {
      return passportCallback(createError(401, 'cannot find user'));
    }
    const filter = builder.filterUserByEmailOrProviderId(provider, profile);

    try {
      const existingUser = await users.findOne(filter);
      if (!existingUser) {
        // user doesn't exists: we create it
        const { insert, insertToken } = builder.genInsert(provider, profile);
        req.authBearerToken = insertToken.value;
        const insertResult = await users.insertOne(insert);
        const payload = { _id: insertResult.insertedId, ...insert };
        passportCallback(null, payload);

        // We dispatch an event here to be able to execute side effects, i.e. create a lead in a 3rd party CRM
        return req.service.emit('signup', payload);
      }
      const { update, updateToken } = builder.genUpdate(provider, profile);

      const existingProvidersIdentities = Object.entries(existingUser.identities)
        .filter(([key, value]) => !!availableProviders[key] && !!value.id)
        .map(([key, value]) => key);
      let providersToRemove = [];

      if (existingProvidersIdentities.length >= 1 && !existingProvidersIdentities.includes(provider.name)) {
        // user exists, has one on more identities, but not the one we are trying to login with: we return an error with providers the user should login with
        return passportCallback(
          createError(409, `user already exists with identity providers ${existingProvidersIdentities.split(', ')}`)
        );
      } else if (existingProvidersIdentities.length > 1) {
        // user exists and has multiple identities: we update it by removing the other ones, to keep only the one the user is trying to login with
        update.$unset = existingProvidersIdentities.reduce((acc, key) => {
          if (key !== provider.name) {
            acc[`identities.${key}`] = '';
          }
          return acc;
        }, {});
        providersToRemove = existingProvidersIdentities.filter(providerName => providerName !== provider.name);
      }
      /*
       *  2 other cases:
       * user exists, but has no identities (for instance: invitation): we update it
       * user exists, has only one identity: the one we are trying to login with: we update it too
       */

      const result = await users.findOneAndUpdate(filter, update, { returnDocument: 'after' });
      req.authBearerToken = updateToken.value;
      passportCallback(null, result.value);
      await deleteExpiredTokens(existingUser.tokens, existingUser._id, db, providersToRemove);
      // We dispatch an event here to be able to execute side effects when a user log in, i.e. send the event to a 3rd party CRM
      req.service.emit('login', result.value);
    } catch (e) {
      passportCallback();
    }
  });
};
