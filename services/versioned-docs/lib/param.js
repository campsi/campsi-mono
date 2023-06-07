const createObjectId = require('../../../lib/modules/createObjectId');
const { can } = require('./modules/permissions');
const createError = require('http-errors');

module.exports.attachResource = function (options) {
  return (req, res, next) => {
    this.attach(req, res, next, options);
  };
};

module.exports.attach = (req, res, next, options) => {
  if (req.params.resource) {
    req.resource = options.resources[req.params.resource];

    if (!req.resource) throw new createError.NotFound(`Resource ${req.params.resource} not found`);

    if (req.params.id) {
      req.filter = { _id: createObjectId(req.params.id) };
      if (!req.filter._id) {
        throw new createError.BadRequest("Can't recognize proper id");
      }
    }

    // USER can access RESOURCE/FILTER with METHOD?
    try {
      const filter = can(req.user, req.resource, req.method);
      req.filter = { ...req.filter, ...filter };
      next();
    } catch (err) {
      throw new createError.Unauthorized(err.message);
    }
  }
};
