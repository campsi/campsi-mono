const findCallback = require('./modules/findCallback');
const builder = require('./modules/queryBuilder');

/**
 * Intercepts passport callback
 * @param fn
 * @param args
 * @param done
 */
function proxyVerifyCallback (fn, args, done) {
  const {callback, index} = findCallback(args);
  args[index] = function (err, user) {
    done(err, user, callback);
  };
  fn.apply(null, args);
}

module.exports = function passportMiddleware (req) {
  const users = req.db.collection('__users__');
  const provider = req.authProvider;
  proxyVerifyCallback(provider.callback, arguments, function (err, profile, passportCallback) {
    if (!profile || err) {
      return passportCallback('cannot find user');
    }
    let filter = builder.filterUserByEmailOrProviderId(provider, profile);
    let update = builder.genUpdate(provider, profile);

    users.findOneAndUpdate(filter, update, {returnOriginal: false})
      .then((result) => {
        if (result.value) {
          return passportCallback(null, result.value);
        }

        let insert = builder.genInsert(provider, profile, update);
        return users.insertOne(insert).then((insertResult) => passportCallback(null, insertResult.ops[0]));
      }).catch(passportCallback);
  });
};
