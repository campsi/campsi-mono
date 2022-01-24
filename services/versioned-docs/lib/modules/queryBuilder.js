const debug = require('debug')('campsi:service:docs');
const forIn = require('for-in');
const { ObjectId } = require('mongodb');
const createObjectId = require('../../../../lib/modules/createObjectId');

/**
 * Simple utility function that converts a list of arguments
 * into a dot notation string
 * @param {string} properties
 * @return {string}
 */
const join = (...properties) => {
  return properties.join('.');
};

/**
 * Validate a document against its resource
 * @param {object} resource
 * @param {object} doc
 * @param {boolean} doValidate
 * @returns {Promise}
 */
const validate = async (resource, doc) => {
  if (await resource.validate(doc)) {
    return true;
  } else {
    debug('model have %d error(s)', resource.validate.errors.length);
    throw new Error(
      resource.validate.errors.map(e => `${e.dataPath} ${e.message}`).join(', ')
    );
  }
};

const buildRelsId = (resource, doc) => {
  const relsId = {};
  if (resource.rels) {
    Object.entries(resource.rels).map(([name, rel]) => {
      if (doc[`${rel.path}`]) {
        const relId = createObjectId(doc[`${rel.path}`]);
        if (!relId) {
          throw new Error(`Invalid ${rel.path}`);
        }
        relsId[`${rel.path}`] = relId;
      }
    });
  }
  return relsId;
};

module.exports.find = function find(options) {
  let filter = {};
  if (options.query) {
    forIn(options.query, (val, prop) => {
      filter[`${prop}`] = val;
    });
  }
  return filter;
};
/**
 *
 * @param {Object} options.data
 * @param {Resource} options.resource
 * @param {String} [options.state]
 * @param {User} [options.user]
 * @returns {Promise}
 */
module.exports.create = async options => {
  await validate(options.resource, options.data);
  const relsId = buildRelsId(options.resource, options.data);

  const doc = {
    revision: options.revision || 1,
    ...options.data,
    ...relsId,
    users: {},
    groups: options.groups || [],
    createdAt: new Date(),
    createdBy: options.user ? options.user._id : null
  };
  if (options.user) {
    doc.users[options.user._id.toString()] = {
      roles: ['owner'],
      addedAt: new Date(),
      userId: options.user._id
    };
  }
  return doc;
};

module.exports.replace = async options => {
  await validate(options.resource, options.data);
  const relsId = buildRelsId(options.resource, options.data);

  return {
    ...options.originalDoc,
    ...options.data,
    ...relsId,
    revision: options.originalDoc.revision + 1,
    updatedAt: new Date(),
    updatedBy: options.user ? options.user._id : null
  };
};

module.exports.deleteFilter = function deleteDoc(options) {
  let filter = {};
  filter._id = options.id;
  filter.states = {};
  return filter;
};
