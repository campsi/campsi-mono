const CryptoJS = require('crypto-js');
const handlers = require('./handlers');
const helpers = require('campsi/lib/modules/responseHelpers');
const state = require('./state');

function testPassword(provider, user, password) {
    const decrypted = CryptoJS.AES.decrypt(
        user.identities.local.password,
        provider.options.salt
    ).toString(CryptoJS.enc.Utf8);
    return password === decrypted;
}

module.exports.middleware = function (localProvider) {
    return (req, res, next) => {
        req.authProvider = localProvider;
        state.serialize(req);
        next();
    };
};

module.exports.signin = function (req, res) {
    // could be a one-liner, but I find this more explicit
    return handlers.callback(req, res);
};

function encryptPassword(password, salt) {
    return CryptoJS.AES.encrypt(password, salt).toString();
}

function createValidationToken(username, salt) {
    return CryptoJS.AES.encrypt(new Date().toISOString() + username, salt).toString();
}

module.exports.signup = function (req, res) {
    const salt = req.authProvider.options.salt;
    if (!req.body.password || !req.body.displayName || !req.body.username) {
        return helpers.error(res, { message: 'bad request' });
    }

    let user = {
        displayName: req.body.displayName,
        email: req.body.email || req.body.username,
        identities: {
            local: {
                id: req.body.username,
                username: req.body.username,
                password: encryptPassword(req.body.password, salt),
                validated: false,
                validationToken: createValidationToken(req.body.username, salt)
            }
        }
    };

    req.db.collection('__users__').insertOne(user)
        .then(() => handlers.callback(req, res))
        .then(() => {
            req.service.emit('local/signup', {
                email: user.email,
                username: user.username,
                token: user.identities.local.validationToken
            });
        })
        .catch((err) => handlers.redirectWithError(req, res, err));
};

/**
 * Search the user that matches the validationToken
 * if found, it's marked as validated. Request is redirected 
 * to the specified redirectURI.
 * 
 * @param {request} req 
 * @param {string} req.query.token
 * @param {string} req.query.redirectURI
 * @param {*} res 
 */
module.exports.validate = function (req, res) {

    if (!req.query.token || !req.query.redirectURI) {
        return helpers.error(res, { message: 'bad request' });
    }

    req.db.collection('__users__').updateOne(
        { 'identities.local.validationToken': req.query.token },
        { $set: { 'identities.local.validated': true }, $unset: { 'identities.local.validationToken': '' } }
    ).then((out) => {
        if(out.result.nModified === 1){
            res.redirect(req.query.redirectURI, 301);
        } else {
            res.status(404);            
            res.json({error: true, message: 'Validation Token not found'});
        }
    }).catch(() => {
        res.status(500);
    });
};

module.exports.resetPassword = function (req, res) {
    if (!req.body.password) {
        return helpers.error(res, { message: 'bad request' });
    }

    if (!req.user) {
        return helpers.serviceNotAvailable(res);
    }

    const localProvider = req.authProvider;
    const encryptedPassword = CryptoJS.AES.encrypt(
        req.body.password,
        localProvider.options.salt
    ).toString();

    let filter = { _id: req.user._id };
    let update = { $set: { 'identities.local.password': encryptedPassword }, $unset: { 'token': '' } };

    req.body.username = req.user.identities.local.username;
    delete (req.user);

    req.db.collection('__users__').updateOne(filter, update)
        .then(() => handlers.callback(req, res))
        .catch((err) => handlers.redirectWithError(req, res, err));
};

module.exports.callback = function localCallback(req, username, password, done) {
    let filter = {};
    filter['identities.local.username'] = username;
    req.db.collection('__users__').findOne(filter).then((user) => {
        if (user && user.identities.local && testPassword(req.authProvider, user, password)) {
            user.identity = user.identities.local;
            return done(null, user);
        }
        done(null, null);
    }).catch(done);
};

//export encryption methods to use in test mocks
module.exports.encryptPassword = encryptPassword;
module.exports.createValidationToken = createValidationToken;
