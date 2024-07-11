const debug = require('debug')('campsi');
const { ObjectId } = require('mongodb');

/**
 *
 * @param {ObjectId|string} str
 * @param {boolean} [silentMode = true]
 * @returns {undefined|ObjectId}
 */
module.exports = function createObjectId(str, silentMode = true) {
  const oid = ObjectId.isValid(str?.toString().trim()) ? new ObjectId(str.toString().trim()) : undefined;
  if (!oid && !silentMode) debug('wrong object id %s', str);
  return oid;
};
