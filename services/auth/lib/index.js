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
const createError = require('http-errors');

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
      next();
    });
    this.router.use(passport.initialize());
    this.router.param('provider', (req, res, next, id) => {
      req.authProvider = providers[id];
      return !req.authProvider ? helpers.notFound(res) : next();
    });
    const limiter = this.server.limiter || ((req, res, next) => next());

    const validatePasswordResetUrl = (req, res, next) => {
      if (typeof this.options.validatePasswordResetUrl !== 'function') {
        return next();
      }
      return next(this.options.validatePasswordResetUrl(req.body?.resetUrl) ? null : createError(400, 'Invalid reset URL'));
    };

    const validateRedirectURI = (req, res, next) => {
      if (typeof this.options.validateRedirectURI !== 'function') {
        return next();
      }
      return next(this.options.validateRedirectURI(req.query.redirectURI) ? null : createError(400, 'invalid redirectURI'));
    };

    router.get(
      // #swagger.ignore = true
      '/users',
      handlers.getUsers
    );
    router.get(
      // #swagger.ignore = true
      '/users/:userId/extract_personal_data',
      handlers.extractUserPersonalData
    );
    router.get(
      // #swagger.ignore = true
      '/users/:userId/access_token',
      handlers.getAccessTokenForUser
    );

    router.delete(/* #swagger.ignore = true */ '/users/:userId[:]soft-delete', handlers.softDelete);

    router.get(
      // #swagger.ignore = true
      '/providers',
      handlers.getProviders
    );
    router.get(
      /*
        #swagger.tags = ['Auth service']
        #swagger.path = '/auth/me'
        #swagger.description = 'AUTH_ME_DESCRIPTION'
        #swagger.summary = 'AUTH_ME_SUMMARY'
        #swagger.security = [{
          "bearerAuth": []
        }]
        #swagger.responses[200] = {
            description: "Token",
            content: {
                "application/json": {
                    schema:{
                        $ref: "#/components/schemas/MyUserResponse"
                    }
                }
            }
        }
        */
      '/me',
      validateRedirectURI,
      handlers.me
    );
    router.put(
      // #swagger.ignore = true
      '/me',
      handlers.updateMe
    );
    router.patch(
      /*
        #swagger.tags = ['Auth service']
        #swagger.path = '/auth/me'
        #swagger.description = 'AUTH_PARTIALLY_UPDATE_DESCRIPTION'
        #swagger.summary = 'AUTH_PARTIALLY_UPDATE_SUMMARY'
        #swagger.security = [{
          "bearerAuth": []
        }]
        #swagger.requestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/CreateUserRequest" }
                }
            }
        }
        #swagger.responses[200] = {
            description: "Token",
            content: {
                "application/json": {
                    schema:{
                        $ref: "#/components/schemas/MyUserResponse"
                    }
                }
            }
        }
        */
      '/me',
      handlers.patchMe
    );
    router.get(
      // #swagger.ignore = true
      '/anonymous',
      handlers.createAnonymousUser
    );
    router.get(
      /*
        #swagger.tags = ['Auth service']
        #swagger.path = '/auth/logout'
        #swagger.description = 'AUTH_LOGOUT_DESCRIPTION'
        #swagger.summary = 'AUTH_LOGOUT_SUMMARY'
        #swagger.security = [{
          "bearerAuth": []
        }]
        #swagger.responses[200] = {
            description: "Token",
            content: {
                "application/json": {
                    schema:{
                        $ref: "#/components/schemas/LogoutResponse"
                    }
                }
            }
        }
        */
      '/logout',
      handlers.logout
    );
    router.post(
      /*
        #swagger.tags = ['Auth service']
        #swagger.path = '/auth/invitations'
        #swagger.description = 'AUTH_INVITATION_DESCRIPTION'
        #swagger.summary = 'AUTH_INVITATION_SUMMARY'
        #swagger.security = [{
          "bearerAuth": []
        }]
        #swagger.requestBody = {
          required: true,
          content: {
              "application/json": {
                  schema: { $ref: "#/components/schemas/InvitationRequest" }
              }
          }
        }
        #swagger.responses[200] = {
            description: "Token",
            content: {
                "application/json": {
                    schema:{
                        $ref: "#/components/schemas/InvitationResponse"
                    }
                }
            }
        }
        */
      '/invitations',
      handlers.inviteUser
    );
    router.get(/* #swagger.ignore = true */ '/invitations/:invitationToken', limiter, handlers.getUserByInvitationToken);
    router.post(
      // #swagger.ignore = true
      '/invitations/:invitationToken',
      handlers.acceptInvitation
    );
    router.deleteAsync(
      // #swagger.ignore = true
      '/invitations/:invitationToken',
      handlers.deleteInvitation
    );
    router.put(
      // #swagger.ignore = true
      '/tokens',
      handlers.tokenMaintenance
    );

    if (providers.local) {
      router.use(
        // #swagger.ignore = true
        '/local',
        local.middleware(providers.local)
      );
      router.post(
        /*
        #swagger.tags = ['Auth service'],
        #swagger.path = '/auth/local/signup'
        #swagger.description = 'AUTH_LOCAL_SIGNUP_DESCRIPTION'
        #swagger.summary = 'AUTH_LOCAL_SIGNUP_SUMMARY'
        #swagger.requestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/CreateUserRequest" }
                }
            }
        }
        #swagger.responses[200] = {
            description: "Token",
            content: {
                "application/json": {
                    schema:{
                        $ref: "#/components/schemas/TokenResponse"
                    }
                }
            }
        }
        */
        '/local/signup',
        local.signup
      );
      router.post(
        /*
        #swagger.tags = ['Auth service']
        #swagger.path = '/auth/local/signin'
        #swagger.description = 'AUTH_LOCAL_SIGNIN_DESCRIPTION'
        #swagger.summary = 'AUTH_LOCAL_SIGNIN_SUMMARY'
        #swagger.requestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/CredentialRequest" }
                }
            }
        }
        #swagger.responses[200] = {
            description: "Token",
            content: {
                "application/json": {
                    schema:{
                        $ref: "#/components/schemas/TokenResponse"
                    }
                }
            }
        }
        */
        '/local/signin',
        local.signin
      );
      router.postAsync(
        // #swagger.ignore = true
        '/local/reset-password-token',
        validatePasswordResetUrl,
        local.createResetPasswordToken
      );
      router.post(
        // #swagger.ignore = true
        '/local/reset-password',
        local.resetPassword
      );
      router.get(
        // #swagger.ignore = true
        '/local/validate',
        local.validate
      );
      router.put(
        // #swagger.ignore = true
        '/local/update-password',
        local.updatePassword
      );
    }
    this.router.get(
      // #swagger.ignore = true
      '/:provider',
      handlers.initAuth
    );
    this.router.get(
      // #swagger.ignore = true
      '/:provider/callback',
      handlers.callback
    );
  }

  getMiddlewares() {
    return [session, authUser];
  }

  install() {
    this.db
      .collection(getUsersCollectionName())
      .createIndex({ email: 1 }, { unique: true })
      .catch(err => {
        debug("Can't apply unique index on users collection");
        debug(err);
      });
    if (this.options.providers.local) {
      this.db
        .collection(getUsersCollectionName())
        .createIndex({ 'identities.local.validationToken': 1 })
        .catch(err => debug(err));
    }
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
