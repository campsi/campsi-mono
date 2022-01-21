const debug = require('debug')('campsi');
const { ObjectId } = require('mongodb');

/**
 *
 * @param str
 * @returns {undefined|ObjectId}
 */
module.exports = function createObjectId(str) {
  let oid;
  try {
    oid = ObjectId(str);
  } catch (err) {
    debug('wrong object id %s', str);
  }
  return oid;
};
