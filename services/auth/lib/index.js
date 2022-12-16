const CampsiService = require('../../../lib/service');
const local = require('./local');
const passportMiddleware = require('./passportMiddleware');
const passport = require('@passport-next/passport');
const helpers = require('../../../lib/modules/responseHelpers');
const handlers = require('./handlers');
const debug = require('debug')('campsi');
const authUser = require('./middleware/authUser');
const session = require('./middleware/session');
const createObjectId = require('../../../lib/modules/createObjectId');
const { getUsersCollectionName } = require('./modules/collectionNames');
const mfaHandlers = require('./mfaHandlers');

module.exports = class AuthService extends CampsiService {
  initialize() {
    this.install();
    this.prepareAuthProviders();
    this.patchRouter();
    return super.initialize();
  }

  prepareAuthProviders() {
    // eslint-disable-next-line array-callback-return
    Object.entries(this.options.providers).map(([name, provider]) => {
      provider.options.passReqToCallback = true;
      provider.options.scope = provider.scope;
      provider.name = name;
      if (name === 'local') {
        provider.callback = local.callback;
      }
      // noinspection JSUnresolvedFunction
      passport.use(name, new provider.Strategy(provider.options, passportMiddleware));
    });
  }

  // eslint-disable-next-line max-statements
  patchRouter() {
    const router = this.router;
    const providers = this.options.providers;
    this.router.use((req, res, next) => {
      req.authProviders = providers;
      req.service = this;
      if (this.options?.mfa?.twilio) {
        const twilioClient = require('twilio')(this.options.mfa.twilio.accountSid, this.options.mfa.twilio.authToken);
        req.verifyClient = twilioClient.verify.v2.services(this.options.mfa.twilio.serviceSid);
      }
      next();
    });

    this.router.use(passport.initialize());
    this.router.param('provider', (req, res, next, id) => {
      req.authProvider = providers[id];
      return !req.authProvider ? helpers.notFound(res) : next();
    });

    router.get('/users', handlers.getUsers);
    router.get('/users/:userId/extract_personal_data', handlers.extractUserPersonalData);
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
    router.put('/tokens', handlers.tokenMaintenance);

    if (providers.local) {
      router.use('/local', local.middleware(providers.local));
      router.post('/local/signup', local.signup);
      router.post('/local/signin', local.signin);
      router.post('/local/reset-password-token', local.createResetPasswordToken);
      router.post('/local/reset-password', local.resetPassword);
      router.get('/local/validate', local.validate);
      router.put('/local/update-password', local.updatePassword);
    }
    this.router.get('/:provider', handlers.initAuth);
    this.router.get('/:provider/callback', handlers.callback);

    router.getAsync('/mfa/send-otp-code', mfaHandlers.sendOtpCode);
    router.getAsync('/mfa/verify-otp-code', mfaHandlers.verifyOtpCode);

    this.router.get('/mfa/create-totp-seed-factor', mfaHandlers.createTotpSeedFactor);
    this.router.get('/mfa/verify-totp-registration-code', mfaHandlers.verifyTotpRegistrationCode);
    this.router.get('/mfa/verify-totp-code', mfaHandlers.verifyTotpCode);
  }

  getMiddlewares() {
    return [session, authUser];
  }

  attachVerifyClient(req, res, next) {
    req.verifyClient = this.verifyClient;
    next();
  }

  install() {
    this.db
      .collection(getUsersCollectionName())
      .createIndex({ email: 1 }, { unique: true })
      .catch(err => {
        debug("Can't apply unique index on users collection");
        debug(err);
      });
  }

  async fetchUsers(userIds) {
    const filter = { _id: { $in: userIds.map(id => createObjectId(id)) } };
    const users = await this.db.collection(getUsersCollectionName()).find(filter).toArray();
    const map = users.reduce((map, user) => {
      map[user._id.toString()] = user;
      return map;
    }, {});
    return userIds.map(userId => map[userId] || userId);
  }
};
