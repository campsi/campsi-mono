var axios = require('axios');
var util = require('util');
var debug = require('debug')('campsi-service-auth-exaprint');
var Strategy = require('@passport-next/passport-strategy');
var querystring = require('querystring');
/**
 * @param {String} options.clientID
 * @param {String} options.clientSecret
 * @param {String} [options.protocol]
 * @param {String} [options.host]
 * @constructor
 */
function ExaprintStrategy (options, callback) {
  debug('clientID', options.clientID, callback);
  options = options || {};
  options.protocol = options.protocol || 'https';
  options.host = options.host || 'auth.exaprint.fr';
  Strategy.call(this, options);
  this.name = 'exaprint';
  this._verify = callback;
  this.options = options;
  this.client = axios.create({
    baseURL: `https://${options.host}/api/v1`
  });
}
// https://localhost:3003/auth/exaprint
ExaprintStrategy.prototype.authenticate = function (req, options) {
  debug('authenticate', req.query, req.body, options);
  if (req.query.code) {
    debug('auth code received', req.query.code);
    this.requestToken(req, options).then(data => {
      this.fetchUser(req, data.access_token).then(user => {
        debug('user', user);
        this.success({email: 'romainbessuges@gmail.com'});
      });
    });
  } else {
    return this.authorize(req, options);
  }
};

ExaprintStrategy.prototype.fetchUser = function (req, token) {
  return this.client.get(`/me?access_token=${token}`).then(response => response.data);
};

ExaprintStrategy.prototype.authorize = function (req, options) {
  const redirectURI = 'https://localhost:3003/auth/exaprint/callback';
  const requestParams = {
    client_id: this.options.clientID,
    response_type: 'code',
    redirect_uri: redirectURI,
    scope: 'user'
  };
  const qs = querystring.stringify(requestParams);
  const url = `${this.options.protocol}://${this.options.host}/api/v1/authorize?${qs}`;
  this.redirect(url);
};

ExaprintStrategy.prototype.requestToken = function (req, options) {
  return this.client.post('/token', querystring.stringify({
    client_id: this.options.clientID,
    client_secret: this.options.clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: this.options.callbackURL,
    code: req.query.code
  })).then(response => response.data);
};

util.inherits(ExaprintStrategy, Strategy);

/**
 *
 * @param {Object} options
 * @param {String} options.consumerKey
 * @param {String} options.consumerSecret
 * @param {String} [options.baseUrl]
 * @param {String} [options.order]
 * @returns AuthProviderConfig
 */
module.exports = function (options) {
  return {
    order: options.order,
    title: 'Exaprint',
    Strategy: ExaprintStrategy,
    options: {
      clientID: options.clientID,
      clientSecret: options.clientSecret,
      callbackURL: options.baseUrl + '/exaprint/callback',
      protocol: options.protocol,
      host: options.host
    },
    callback: function (req, token, tokenSecret, profile, done) {
      done(null, profile);
    }
  };
};
