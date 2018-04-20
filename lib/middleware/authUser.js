const passport = require('passport');
const BearerStrategy = require('passport-http-bearer').Strategy;
const debug = require('debug')('campsi:auth:bearerMiddleware');

/**
 * Bearer token authorization used for API calls.
 * High order function returning the actual middleware
 * @param {CampsiServer} server
 * @returns {Function}
*/
module.exports = function authUser (server) {
  // Middleware initialization, we register a new BearerStrategy
  const users = server.db.collection('__users__');
  // If the Authorization header contains a valid token
  // This strategy will return the associated user
  passport.use(new BearerStrategy(function (token, done) {
    // users "tokens" property is an object
    // which have token as propertyName
    // and expiration date as value
    let query = {};
    // expiration date is set in the future when the user signs in
    // it's easier and more elegant to check if the exp date is "later than now"
    query[`tokens.${token}.expiration`] = {$gt: new Date()};
    users.findOne(query, (err, user) => {
      if (err) {
        debug('user findOne problem', query, err);
      }
      debug('bearer strategy active', user.identities.local);
      return done(null, user, {scope: 'all'});
    });
  }));

  // Here's the actual midleware
  return (req, res, next) => {
    // We check for the Authorization header OR the access_token in the query string
    if (req.headers.authorization || req.query.access_token) {
      req.authBearerToken = req.query.access_token || req.headers.authorization.substring('Bearer '.length);
      // noinspection JSUnresolvedFunction
      return passport.authenticate('bearer', {session: false})(req, res, next);
    }
    next();
  };
};
