const forIn = require('for-in');

module.exports.getResources = function(options) {
  let result = { resources: [] };
  result.classes = options.classes;
  Object.entries(options.resources).map(([id, resource]) => {
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
  return result;
};
