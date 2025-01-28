const { serviceNotAvailableRetryAfterSeconds } = require('../modules/responseHelpers');
const rateLimitMiddleware = function (rateLimits) {
  return (req, res, next) => {
    const ipaddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const rateLimiterKey = rateLimits.key + ':' + ipaddress;
    const redis = req.campsi.redis;
    const rPerWindow = rateLimits.requests ?? 5;
    redis.setnx(rateLimiterKey, rPerWindow + 1).then(newKey => {
      const decr = () => {
        redis.decr(rateLimiterKey).then(n => {
          if (!n || n <= 0) {
            serviceNotAvailableRetryAfterSeconds(res, 1, rateLimits.message, rateLimits.key);
          } else {
            next();
          }
        });
      };
      if (newKey) {
        redis.expire(rateLimiterKey, rateLimits.window /* for testing: * 60 */).then(decr);
      } else {
        decr();
      }
    });
  };
};

module.exports = {
  rateLimitMiddleware
};
