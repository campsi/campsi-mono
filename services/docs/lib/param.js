const helpers = require('../../../lib/modules/responseHelpers');
const createObjectID = require('../../../lib/modules/createObjectID');
const { can } = require('./modules/permissions');
const { ObjectId } = require('mongodb');
const {
  getValidGroupsFromString,
} = require('../../../lib/modules/groupsHelpers');

module.exports.attachResource = function (options) {
  return (req, res, next) => {
    if (req.params.resource) {
      req.resource = options.resources[req.params.resource];

      // Unknown resource ?
      if (!req.resource) {
        return helpers.notFound(res);
      }

      // Is state defined for this resource ?
      const state = req.params.state || req.query.state;
      if (state) {
        if (typeof req.resource.states[state] === 'undefined') {
          return helpers.notFound(res);
        }
        req.state = state;
      } else {
        req.state = req.resource.defaultState;
      }

      // Is ID well-formed ?
      if (req.params.id) {
        req.filter = { _id: createObjectID(req.params.id) };
        if (!req.filter._id) {
          return helpers.error(res, new Error("Can't recognize id"));
        }
      }

      req.groups = req.query?.groupsIds
        ? getValidGroupsFromString(req.query?.groupsIds)
        : [];

      // USER can access RESOURCE/FILTER with METHOD/STATE ?
      can(req.user, req.resource, req.method, req.state)
        .then((filter) => {
          req.filter = Object.assign({}, req.filter, filter);
          next();
        })
        .catch((err) => helpers.unauthorized(res, err));
    }
  };
};
