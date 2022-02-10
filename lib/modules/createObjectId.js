const debug = require('debug')('campsi');
const { ObjectId } = require('mongodb');

/**
 *
 * @param str
 * @returns {undefined|ObjectId}
 */
module.exports = function createObjectId(str) {
  const oid = ObjectId.isValid(str.toString()) ? ObjectId(str) : undefined;
  if (!oid) debug('wrong object id %s', str);
  return oid;
};
