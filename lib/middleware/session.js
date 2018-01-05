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
            uri: 'mongodb://{0}:{1}/{2}'.format(
                server.config.mongo.host,
                server.config.mongo.port,
                server.config.mongo.name
            ),
            collection: '__sessions__'
        })
    });
};
