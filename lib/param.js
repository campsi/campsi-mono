const helpers = require('campsi/lib/modules/responseHelpers');
const createObjectID = require('campsi/lib/modules/createObjectID');

function can(user, resource, filter, method, state) {
    return new Promise((resolve, reject) => {

        // Get all roles of user (all users have public role)
        let roles = ['public'];
        if (user && Array.isArray(user.roles)) {
            roles = roles.concat(user.roles);
        }

        // Test permission for each role, resolve if any is ok
        roles.forEach((role) => {
            if (resource.permissions[role] !== undefined) {
                let permission = resource.permissions[role][state];
                if (permission && (permission.includes(method) || permission === '*')) {
                    return resolve();
                }
            }
        });

        // At last test special 'owner' role. DB query is made at very end
        if(filter === undefined) {
            return reject();
        }
        if (resource.permissions['owner'] === undefined) {
            return reject();
        }
        let permission = resource.permissions['owner'][state];
        if (!permission || (!permission.includes(method) && permission !== '*')) {
            return reject();
        }
        resource.collection.findOne(filter, ['ownedBy'], (err, doc) => {
            if(doc && doc.ownedBy && doc.ownedBy === user._id) {
                return resolve();
            } else {
                return reject();
            }
        });
    });
}

module.exports.attachResource = function(options) {
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
            can(req.user, req.resource, req.filter, req.method, req.state)
                .then(() => {
                    next();
                })
                .catch(() => {
                    return helpers.unauthorized(res);
                });
        }
    };
};
