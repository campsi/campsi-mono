/* eslint-disable array-callback-return */
const debug = require('debug')('campsi:service:versioned-docs');
const createObjectId = require('../../../../lib/modules/createObjectId');
/**
 * Validate a document against its resource
 * @param {object} resource
 * @param {object} doc
 * @returns {boolean|Error}
 */
const validate = async (resource, doc) => {
  if (await resource.validate(doc)) {
    return true;
  } else {
    debug('model have %d error(s)', resource.validate.errors.length);
    throw new Error(resource.validate.errors.map(e => `${e.dataPath} ${e.message}`).join(', '));
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
  const filter = {};
  if (options.query) {
    const relsPath = Object.entries(options.resource.rels || []).map(([name, rel]) => {
      return rel.path;
    });
    Object.entries(options.query).map(([prop, val]) => {
      if (prop.startsWith('data.')) {
        prop = prop.slice(5);
        if (relsPath.includes(prop)) {
          val = createObjectId(val);
          if (!val) {
            throw new Error(`Invalid ${prop}`);
          }
        }
        filter[`${prop}`] = val;
      }
    });
  }
  return filter;
};
/**
 *
 * @param {Object} options  {data, resource, user}
 * @returns {Object}
 */
module.exports.create = async options => {
  await validate(options.resource, options.data);
  const sanitizedData = options.data;
  const relsId = buildRelsId(options.resource, sanitizedData);

  const doc = {
    revision: options.revision || 1,
    ...sanitizedData,
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
  const sanitizedData = options.data;
  const relsId = buildRelsId(options.resource, sanitizedData);

  return {
    ...options.originalDoc,
    ...sanitizedData,
    ...relsId,
    revision: options.originalDoc.revision + 1,
    updatedAt: new Date(),
    updatedBy: options.user ? options.user._id : null
  };
};
