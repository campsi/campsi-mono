const session = require('express-session');
const SessionStore = require('connect-mongodb-session')(session);
const mongoUriBuilder = require('mongo-uri-builder');
/**
 *
 * @param {CampsiServer} server
 * @returns {Function}
 */
module.exports = function authUser(server, service) {

    let mongo = Object.assign({}, server.config.mongo);
    mongo.database = mongo.store;

    return session({
        secret: service.config.options.session.secret,
        resave: false,
        saveUninitialized: false,
        store: new SessionStore({
            uri: mongoUriBuilder(mongo),
            collection: '__sessions__'
        })
    });
};
