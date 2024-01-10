const passport = require('@passport-next/passport');
const { getUsersCollection } = require('../modules/collectionNames');
const BearerStrategy = require('@passport-next/passport-http-bearer').Strategy;
const debug = require('debug')('campsi:auth:bearerMiddleware');

/**
 * Bearer token authorization used for API calls.
 * High order function returning the actual middleware
 * @param {CampsiServer} server
 * @param {AuthService} service
 * @returns {Function}
 */
module.exports = function authUser(server, service) {
  // Initialize passport
  server.app.use(passport.initialize());
  // Middleware initialization, we register a new BearerStrategy
  const users = server.db.collection(service.getUsersCollectionName());
  // If the Authorization header contains a valid token
  // This strategy will return the associated user
  passport.use(
    new BearerStrategy(async function (token, done) {
      // users "tokens" property is an object
      // which have token as propertyName
      // and expiration date as value
      const query = {};
      // expiration date is set in the future when the user signs in
      // it's easier and more elegant to check if the exp date is "later than now"
      query[`tokens.${token}.expiration`] = { $gt: new Date() };
      try {
        const user = await users.findOne(query);
        return done(null, user, { scope: 'all' });
      } catch (err) {
        debug('user findOne problem', query, err);
      }
    })
  );

  // Here's the actual midleware
  return (req, res, next) => {
    // We check for the Authorization header OR the access_token in the query string
    if (req.headers.authorization || req.query.access_token) {
      req.authBearerToken = req.query.access_token || req.headers.authorization.substring('Bearer '.length);
      // noinspection JSUnresolvedFunction
      return passport.authenticate('bearer', { session: false })(req, res, next);
    }
    next();
  };
};
