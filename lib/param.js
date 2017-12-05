const helpers = require('campsi/lib/modules/responseHelpers');
const createObjectID = require('campsi/lib/modules/createObjectID');

function can(user, method, resource, state) {

    if (typeof resource === 'undefined') {
        return true;
    }

    let roles = (typeof user === 'undefined') ? 'public' : user.role;

    if (!Array.isArray(roles)) {
        roles = [roles];
    }

    let success = false;

    roles.forEach((role) => {
        if(resource.permissions[role] !== undefined) {
            let permission = resource.permissions[role][state];
            if (permission && (permission.includes(method) || permission === '*')) {
                success = true;
            }
        }
    });

    return success;
}

module.exports.attachResource = function(options) {
    return (req, res, next) => {
        if (req.params.resource) {
            req.resource = options.resources[req.params.resource];

            if (!req.resource) {
                return helpers.notFound(res);
            }

            const state = req.params.state || req.query.state;

            if (state) {
                if (typeof req.resource.states[state] === 'undefined') {
                    return helpers.notFound(res);
                }
                req.state = state;
            } else {
                req.state = req.resource.defaultState;
            }

            if(!can(req.user, req.method, req.resource, req.state)) {
                return helpers.unauthorized(res);
            }

            if (req.params.id) {
                req.filter = {_id: createObjectID(req.params.id)};
                if(!req.filter._id){
                    return helpers.error(res, {message: 'Can\'t recognize id'});
                }
            }
        }

        if (req.params.role && typeof options.roles[req.params.role] === 'undefined') {
            return helpers.notFound(res);
        }
        next();
    };
};
