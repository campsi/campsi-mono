const CampsiService = require('../../../lib/service');
const forIn = require('for-in');
const local = require('./local');
const passportMiddleware = require('./passportMiddleware');
const passport = require('@passport-next/passport');
const helpers = require('../../../lib/modules/responseHelpers');
const handlers = require('./handlers');
const debug = require('debug')('campsi');
const authUser = require('./middleware/authUser');
const session = require('./middleware/session');
const createObjectId = require('../../../lib/modules/createObjectId');

module.exports = class AuthService extends CampsiService {
  initialize() {
    this.install();
    this.prepareAuthProviders();
    this.patchRouter();
    return super.initialize();
  }

  prepareAuthProviders() {
    forIn(this.options.providers, (provider, name) => {
      provider.options.passReqToCallback = true;
      provider.options.scope = provider.scope;
      provider.name = name;
      if (name === 'local') {
        provider.callback = local.callback;
      }
      // noinspection JSUnresolvedFunction
      passport.use(
        name,
        new provider.Strategy(provider.options, passportMiddleware)
      );
    });
  }

  patchRouter() {
    const router = this.router;
    const providers = this.options.providers;
    this.router.use((req, res, next) => {
      req.authProviders = providers;
      req.service = this;
      next();
    });
    this.router.use(passport.initialize());
    this.router.param('provider', (req, res, next, id) => {
      req.authProvider = providers[id];
      return !req.authProvider ? helpers.notFound(res) : next();
    });
    router.get('/users', handlers.getUsers);
    router.get('/users/:userId/access_token', handlers.getAccessTokenForUser);
    router.get('/providers', handlers.getProviders);
    router.get('/me', handlers.me);
    router.put('/me', handlers.updateMe);
    router.patch('/me', handlers.patchMe);
    router.post('/me/groups/:groups', handlers.addGroupsToUser);
    router.get('/anonymous', handlers.createAnonymousUser);
    router.get('/logout', handlers.logout);
    router.post('/invitations', handlers.inviteUser);
    router.post('/invitations/:invitationToken', handlers.acceptInvitation);
    if (providers.local) {
      router.use('/local', local.middleware(providers.local));
      router.post('/local/signup', local.signup);
      router.post('/local/signin', local.signin);
      router.post(
        '/local/reset-password-token',
        local.createResetPasswordToken
      );
      router.post('/local/reset-password', local.resetPassword);
      router.get('/local/validate', local.validate);
    }
    this.router.get('/:provider', handlers.initAuth);
    this.router.get('/:provider/callback', handlers.callback);
  }

  getMiddlewares() {
    return [session, authUser];
  }

  install() {
    this.db
      .collection('__users__')
      .createIndex({ email: 1 }, { unique: true })
      .catch(err => {
        debug("Can't apply unique index on users collection");
        debug(err);
      });
  }

  async fetchUsers(userIds) {
    const filter = { _id: { $in: userIds.map(id => createObjectId(id)) } };
    const users = await this.db
      .collection('__users__')
      .find(filter)
      .toArray();
    const map = users.reduce((map, user) => {
      map[user._id.toString()] = user;
      return map;
    }, {});
    return userIds.map(userId => map[userId] || userId);
  }
};
