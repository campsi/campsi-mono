/**
 * @typedef {Object} PasswordRateLimits
 * @property {string} key - key prefix for redis, like limit's name
 * @property {number} wrongPassword - number of password failures to allow
 * @property {number} wrongPasswordBlockForSeconds - initial number of seconds to block, doubles each subsequent failure
 */

/**
 * Apply defaults consistently to passwordRateLimits incoming data.
 * ensures key, wrongPassword, wrongPasswordBlockForSeconds are set.
 *  @param {PasswordRateLimits?} [passwordRateLimits]
 *  @param {string} [passwordRateLimits.key = 'password-local'] redis key prefix
 *  @param {number} [passwordRateLimits.wrongPassword = 5] number or allowed failures
 *  @param {number} [passwordRateLimits.wrongPasswordBlockForSeconds = 30] initial block time
 *  @returns {PasswordRateLimits}
 */
const passwordRateLimitDefaults = passwordRateLimits => {
  const settings = passwordRateLimits ? { ...passwordRateLimits } : {};
  if (!settings.key) {
    settings.key = 'password-local';
  }
  if (!settings.wrongPassword) {
    settings.wrongPassword = 5;
  }
  if (!settings.wrongPasswordBlockForSeconds) {
    settings.wrongPasswordBlockForSeconds = 30;
  }
  return settings;
};

module.exports = {
  passwordRateLimitDefaults
};
