/**
 * Apply defaults consistently to passwordRateLimits incoming
 * data.
 *
 * ensures key, wrongPassword, wrongPasswordBlockForSeconds are set.
 * defaults:
 *  key: 'password-local'
 *  wrongPassword: 5
 *  wrongPasswordBlockForSeconds: 30
 */
const passwordRateLimitDefaults = (passwordRateLimits) => {
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
