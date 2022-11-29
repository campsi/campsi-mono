/* eslint-disable array-callback-return */
const helpers = require('../../lib/modules/responseHelpers');
const JournalService = require('./services/journal');
const { utils } = require('./utils');

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
      schema: resource.schema ?? utils.validationSchema
    });
  });

  return helpers.json(res, result);
};

module.exports.createLogEntry = async function (req, res) {
  try {
    const id = await JournalService.createAuditEntry(req?.db, req.body, req.options);

    if (!id) {
      helpers.badRequest(res);
    } else {
      helpers.json(res, id);
    }
  } catch (e) {
    helpers.badRequest(res, e);
  }
};

module.exports.getLog = async function (req, res) {
  try {
    const entries = await JournalService.getJournalEntries(
      req?.query?.startDate,
      req?.query.endDate,
      req?.query?.user,
      req?.query?.actionType,
      req?.db,
      req.options
    );
    helpers.json(res, entries);
  } catch (e) {
    helpers.badRequest(res, e);
  }
};
