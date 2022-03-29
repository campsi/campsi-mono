const findCallback = require('./modules/findCallback');
const builder = require('./modules/queryBuilder');

/**
 * Intercepts passport callback
 * @param fn
 * @param args
 * @param done
 */
function proxyVerifyCallback (fn, args, done) {
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
module.exports = function passportMiddleware (req) {
  const users = req.db.collection('__users__');
  const provider = req.authProvider;
  proxyVerifyCallback(provider.callback, arguments, function (
    err,
    profile,
    passportCallback
  ) {
    if (!profile || err) {
      return passportCallback('cannot find user');
    }
    let filter = builder.filterUserByEmailOrProviderId(provider, profile);
    let { update, updateToken } = builder.genUpdate(provider, profile);
    users
      .findOneAndUpdate(filter, update, {
        returnDocument: 'after'
      })
      .then(result => {
        if (result.value) {
          req.authBearerToken = updateToken.value;
          passportCallback(null, result.value);
          // We dispatch an event here to be able to execute side effects
          // when a user log in, i.e. send the event to a 3rd party CRM
          req.service.emit('login', result.value);
          return;
        }
        let { insert, insertToken } = builder.genInsert(provider, profile);
        req.authBearerToken = insertToken.value;
        return users
          .insertOne(insert)
          .then(insertResult => {
            const payload = { _id: insertResult.insertedId, ...insert };
            passportCallback(null, payload);
            // We dispatch an event here to be able to execute side effects
            // i.e. create a lead in a 3rd party CRM
            req.service.emit('signup', payload);
          });
      })
      .catch(() => {
        passportCallback();
      });
  });
};
