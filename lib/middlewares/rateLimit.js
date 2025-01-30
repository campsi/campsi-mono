const { serviceNotAvailableRetryAfterSeconds } = require('../modules/responseHelpers');

/**
 * @typedef {Object} RateLimits
 * @property {string} key - key prefix for redis, like limit's name
 * @property {string} requests - number of requests to allow in a time window
 * @property {string} window - number of seconds to apply the rate limit for
 */

/**
 * Apply defaults to rate limits incoming data.
 * Ensures key, requests and window are set.
 * @param {RateLimits?} [rateLimits]
 * @param {string} [rateLimits.key = 'auth-local'] redis key prefix
 * @param {number} [rateLimits.requests = 5] number of requests in a window
 * @param {number} [rateLimits.window = 1] number of seconds in a window
 */
const rateLimitDefaults = rateLimits => {
  const settings = rateLimits ? { ...rateLimits } : {};
  if (!settings.key) {
    settings.key = 'auth-local';
  }
  if (!settings.requests) {
    settings.requests = 5;
  }
  if (!settings.window) {
    settings.window = 1;
  }
  return settings;
};

const rateLimitMiddleware = function (_rateLimits) {
  const rateLimits = rateLimitDefaults(_rateLimits);
  return (req, res, next) => {
    const ipaddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const rateLimiterKey = rateLimits.key + ':' + ipaddress;
    const redis = req.campsi.redis;
    const rPerWindow = rateLimits.requests ?? 5;
    const ttl = rateLimits.window; // for testing: * 60
    redis.set(rateLimiterKey, rPerWindow + 1, 'NX', 'EX', ttl).then(newKey => {
      redis.decr(rateLimiterKey).then(n => {
        if (!n || n <= 0) {
          serviceNotAvailableRetryAfterSeconds(res, 1, rateLimits.message, rateLimits.key);
        } else {
          next();
        }
      });
    });
  };
};

module.exports = {
  rateLimitMiddleware
};
