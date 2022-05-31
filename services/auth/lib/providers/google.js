/**
 *
 * @param {Object} options
 * @param {String} options.clientID
 * @param {String} options.clientSecret
 * @param {String} options.baseUrl
 * @param {String} [options.title]
 * @param {String} [options.order]
 * @returns AuthProviderConfig
 */
module.exports = function(options) {
  return {
    Strategy: require('@passport-next/passport-google-oauth2').Strategy,
    order: options.order,
    options: {
      clientID: options.clientID,
      clientSecret: options.clientSecret,
      callbackURL: options.baseUrl + '/google/callback'
    },
    title: options.title || 'Google',
    scope: ['profile', 'email'],
    callback: function(req, accessToken, refreshToken, profile, done) {
      // noinspection JSUnresolvedVariable
      done(null, {
        displayName: profile._json.name,
        email: profile.emails[0].value,
        picture: profile._json.picture,
        identity: Object.assign({ id: profile._json.sub }, profile._json)
      });
    }
  };
};
