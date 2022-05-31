/* eslint-disable array-callback-return */
module.exports.getResources = function(options) {
  const result = { resources: [] };
  Object.entries(options.resources).map(([id, resource]) => {
    result.resources.push({
      id,
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
