const helpers = require('campsi/lib/modules/responseHelpers');
const createObjectID = require('campsi/lib/modules/createObjectID');

function can (user, resource, method, state) {
  return new Promise((resolve, reject) => {
    // Get all roles of user (all users have public role)
    let roles = ['public'];
    const emptyFilter = {};

    if (user && Array.isArray(user.roles)) {
      roles = roles.concat(user.roles);
    }

    // Test permission for each role, resolve if any is ok
    for (const role of roles) {
      // if user is admin, he gets to access everything
      if (role === 'admin') {
        return resolve(emptyFilter);
      }
      if (resource.permissions[role] !== undefined) {
        let permission = resource.permissions[role][state];
        if (permission && (permission.includes(method) || permission === '*')) {
          return resolve(emptyFilter);
        }
      }
    }

    // Test Permission for owner role
    if (resource.permissions['owner'] !== undefined) {
      let permission = resource.permissions['owner'][state];
      if (permission && (permission.includes(method) || permission === '*')) {
        return resolve({ownedBy: user._id});
      }
    }

    return reject(new Error('unauthorized user'));
  });
}

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
        req.filter = {_id: createObjectID(req.params.id)};
        if (!req.filter._id) {
          return helpers.error(res, {message: 'Can\'t recognize id'});
        }
      }

      // USER can access RESOURCE/FILTER with METHOD/STATE ?
      can(req.user, req.resource, req.method, req.state)
        .then((filter) => {
          req.filter = Object.assign({}, req.filter, filter);
          next();
        })
        .catch(() => {
          return helpers.unauthorized(res);
        });
    }
  };
};
