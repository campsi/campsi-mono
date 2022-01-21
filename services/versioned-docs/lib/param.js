const helpers = require('../../../lib/modules/responseHelpers');
const createObjectId = require('../../../lib/modules/createObjectId');
const { can } = require('./modules/permissions');
const { ObjectId } = require('mongodb');
const {
  getValidGroupsFromString
} = require('../../../lib/modules/groupsHelpers');

module.exports.attachResource = function(options) {
  return (req, res, next) => {
    if (req.params.resource) {
      req.resource = options.resources[req.params.resource];

      // Unknown resource ?
      if (!req.resource) {
        return helpers.notFound(res);
      }

      // Is ID well-formed ?
      if (req.params.id) {
        req.filter = { _id: createObjectId(req.params.id) };
        if (!req.filter._id) {
          return helpers.error(res, new Error("Can't recognize id"));
        }
      }

      req.groups = req.query?.groups
        ? getValidGroupsFromString(req.query.groups)
        : [];

      // USER can access RESOURCE/FILTER with METHOD?
      try {
        const filter = can(req.user, req.resource, req.method);
        req.filter = { ...req.filter, filter };
        next();
      } catch (err) {
        return helpers.unauthorized(res, err);
      }
    }
  };
};
