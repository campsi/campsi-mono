const CampsiService = require('campsi/lib/service');
const forIn = require('for-in');
const local = require('./local');
const passportMiddleware = require('./passportMiddleware');
const passport = require('passport');
const helpers = require('campsi/lib/modules/responseHelpers');
const handlers = require('./handlers');
const debug = require('debug')('campsi');
const authUser = require('./middleware/authUser');

module.exports = class AuthService extends CampsiService {

    initialize() {
        this.install();

        const providers = this.options.providers;
        const service = this;

        forIn(providers, (provider, providerName) => {
            provider.options.passReqToCallback = true;
            provider.options.scope = provider.scope;
            provider.name = providerName;
            if(providerName === 'local') {
                provider.callback = local.callback;
            }
            //noinspection JSUnresolvedFunction
            passport.use(
                providerName,
                new provider.Strategy(provider.options, passportMiddleware)
            );
        });

        this.router.use(function(req, res, next) {
            req.authProviders = providers;
            req.service = service;
            next();
        });

        this.router.param('provider', function(req, res, next, id) {
            req.authProvider = providers[id];
            return (!req.authProvider) ? helpers.notFound(res) : next();
        });

        this.router.get('/providers', handlers.getProviders);
        this.router.get('/me', handlers.me);
        this.router.put('/me', handlers.updateMe);
        this.router.get('/logout', handlers.logout);

        if(providers.local) {
            this.router.use('/local', local.middleware(providers.local));
            this.router.post('/local/signup', local.signup);
            this.router.post('/local/signin', local.signin);
            this.router.post('/local/reset-password', local.resetPassword);
            this.router.get('/local/validate', local.validate);
        }

        this.router.get('/:provider', handlers.initAuth);
        this.router.get('/:provider/callback', handlers.callback);

        return super.initialize();
    }

    getMiddlewares() {
        return [authUser];
    }

    install() {
        this.db.collection('__users__').createIndex({'email': 1}, {unique: true})
            .catch((err) => {
                debug('Can\'t apply unique index on users collection');
                debug(err);
            });
    }

};
