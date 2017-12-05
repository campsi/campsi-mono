const session = require('express-session');
const SessionStore = require('connect-mongodb-session')(session);
/**
 *
 * @param {CampsiServer} server
 * @returns {Function}
 */
module.exports = function authUser(server, service) {

    return session({
        secret: service.config.options.session.secret,
        resave: false,
        saveUninitialized: false,
        store: new SessionStore({
            uri: server.config.mongoURI,
            collection: '__sessions__'
        })
    });
};
