const session = require('express-session');
const SessionStore = require('connect-mongodb-session')(session);
/**
 *
 * @param {CampsiServer} server
 * @param {AuthService} service
 * @returns {Function}
 */
module.exports = function authUser(server, service) {
  return session({
    secret: service.config.options.session.secret,
    resave: false,
    saveUninitialized: false,
    store: new SessionStore({
      uri: server.config.mongo.uri,
      collection: '__sessions__'
    })
  });
};
