const { ObjectId } = require('mongodb');
const utils = require('../utils.js');
const debug = require('debug')('audit');
const createObjectId = require('../../../lib/modules/createObjectId');

module.exports.createAuditEntry = async function createAuditEntry(db, entry, options) {
  
  if (!entry || !db || !options || Object.keys(entry).length === 0 || Object.keys(options).length === 0) {
    return undefined;
  }

  if (!entry.date || !entry.user || !entry.action || !entry.data) {
    return undefined;
  }

  try {
    let validator;

    // get validator function that should now be in the resource
    for (const [key, resource] of Object.entries(options.resources)) {
      if (resource.validate ) {
        validator = resource.validate;
        break;
      }
    }

    if (!validator) {
      debug('validator object resource is not setup');
      return undefined;
    }

    if (!validator(entry)) {
      debug('schema validation failed' + options.resources.get('audit').validate.errors);
      return undefined;
    }

    if (entry.date) {
      // make sure date is a Date object otherwise it will be stored as a string
      entry.date = new Date(entry.date);
    }

    if (entry.user) {
      entry.user = ObjectId(entry.user);
    }

    const res = await db
      .collection(utils.getCollectionName(options))
      .insertOne({ action: entry.action, data: entry.data, user: createObjectId(entry.user), date: new Date(entry.date) });

    return res.insertedId;
  } catch (ex) {
    return undefined;
  }
};

module.exports.getJournalEntries = async function getJournalEntries(startDate, endDate, user, actionType, db, options) {
  let filter = {};

  if (startDate) {
    filter = { ...filter, date: { ...filter.date, $gte: new Date(new Date(startDate).toISOString()) } };
  }

  if (endDate) {
    filter = { ...filter, date: { ...filter.date, $lt: new Date(new Date(endDate).toISOString()) } };
  }

  if (user) {
    filter = { ...filter, userId: user };
  }

  if (actionType) {
    filter = { ...filter, action: actionType };
  }

  try {
    const res = await db.collection(utils.getCollectionName(options)).findOne(filter);

    if (res) return res;
  } catch (ex) {
    debug(ex);
  }

  return {};
};
