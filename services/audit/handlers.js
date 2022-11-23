/* eslint-disable array-callback-return */
const helpers = require('../../lib/modules/responseHelpers');
const debug = require('debug')('campsi:notifications');
const createObjectId = require('../../lib/modules/createObjectId');

module.exports.getResources = async function (req, res) {
  const result = { resources: [] };
  result.classes = req.options.classes;
  Object.entries(req.options.resources).map(([id, resource]) => {
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

  module.exports.createLogEntry = async function (req, res) {};

  return helpers.json(res, result);
};
