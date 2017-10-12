const forIn = require('for-in');

module.exports.getResources = function(options) {
    let result = {resources: []};
    forIn(options.resources, (resource, id) => {
        result.resources.push({
            id: id,
            label: resource.label,
            type: resource.type,
            states: resource.states,
            defaultState: resource.defaultState,
            permissions: resource.permissions,
            schema: resource.schema
        });
    });

    result.classes = options.classes;

    return Promise.resolve(result);
};
