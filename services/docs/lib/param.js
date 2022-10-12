const helpers = require('../../../lib/modules/responseHelpers');
const createObjectId = require('../../../lib/modules/createObjectId');
const { can } = require('./modules/permissions');
const documentService = require('./services/document');
const { getValidGroupsFromString } = require('../../../lib/modules/groupsHelpers');
const createError = require('http-errors');
const { getDocumentLockServiceOptions } = require('./modules/serviceOptions');

module.exports.attachResource = function (options) {
  return (req, res, next) => {
    this.attach(req, res, next, options);
  };
};

module.exports.attach = (req, res, next, options) => {
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
      req.filter = { _id: createObjectId(req.params.id) };
      if (!req.filter._id) {
        throw new createError.BadRequest("Can't recognize proper id");
      }
    }

    req.groups = req.query?.groups ? getValidGroupsFromString(req.query.groups) : [];

    // check if the document is locked by someone else if we are trying to modify it
    const lockChek = new Promise((resolve, reject) => {
      if (['PUT', 'POST', 'PATCH', 'DELETE'].some(method => req.method.includes(method))) {
        documentService
          .isDocumentLockedByOtherUser(req.state, req.filter, req.user, getDocumentLockServiceOptions(req), req.db)
          .then(lock => {
            if (lock) {
              reject(helpers.unauthorized(res));
            }
            resolve();
          });
      } else resolve();
    });

    lockChek
      .then(() => {
        try {
          const filter = can(req.user, req.resource, req.method, req.state);
          req.filter = { ...req.filter, ...filter };

          next();
        } catch (err) {
          return helpers.unauthorized(res);
        }
      })
      .catch(err => {
        return err;
      });
  }
};
