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
function join(...properties) {
  return properties.join('.');
}
/**
 * Retreive the state object descriptor from its name
 * @param {object} options
 * @param {string} [propertyName]
 * @returns {State}
 */
function getStateFromOptions(options, propertyName) {
  propertyName = propertyName || 'state';
  const stateName = options[propertyName] || options.resource.defaultState;
  let stateObj = options.resource.states[stateName] || { validate: false };
  stateObj.name = stateName;
  return stateObj;
}

/**
 * Validate a document against its resource
 * @param {object} resource
 * @param {object} doc
 * @param {boolean} doValidate
 * @returns {Promise}
 */
function validate(resource, doc) {
  if (resource.validate(doc)) {
    return true;
  } else {
    debug('model have %d error(s)', resource.validate.errors.length);
    throwresource.validate.errors;
  }
}

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
  const validate = await options.resource.validate(options.data);
  if (!validate || options.resource.validate.errors?.length) {
    throw new Error(
      options.resource.validate.errors.map(e => e.message).join(', ')
    );
  }
  const relsId = {};
  if (options.resource.rels) {
    Object.entries(options.resource.rels).map(([name, rel]) => {
      if (options.data[`${rel.path}`]) {
        const relId = createObjectId(options.data[`${rel.path}`]);
        if (!relId) {
          throw new Error(`Invalid ${rel.path}`);
        }
        relsId[`${rel.path}`] = relId;
      }
    });
  }

  let doc = {
    revision: 1,
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

/**
 *
 * @param {object} options.data
 * @param {Resource} options.resource
 * @param {string} [options.state]
 * @param {object} [options.user]
 *
 * @returns {Promise}
 */
module.exports.update = function updateDoc(options) {
  const state = getStateFromOptions(options);
  return new Promise((resolve, reject) => {
    validate(options.resource, options.data, state.validate)
      .catch(reject)
      .then(() => {
        let ops = { $set: {} };
        ops.$set[join('states', state.name, 'modifiedAt')] = new Date();
        ops.$set[join('states', state.name, 'modifiedBy')] = options.user
          ? options.user.id
          : null;
        ops.$set[join('states', state.name, 'data')] = options.data;
        return resolve(ops);
      });
  });
};

module.exports.patch = async options => {
  const state = getStateFromOptions(options);
  try {
    await validate(options.resource, options.data, state.validate);
  } catch (e) {
    throw new Error(`Validation Error: `);
  }

  let ops = { $set: {}, $unset: {} };
  ops.$set[join('states', state.name, 'modifiedAt')] = new Date();
  ops.$set[join('states', state.name, 'modifiedBy')] = options.user
    ? options.user._id
    : null;

  for (const [key, value] of Object.entries(options.data)) {
    const operator = value === null || value === undefined ? '$unset' : '$set';
    ops[operator][join('states', state.name, 'data', key)] = value;
  }

  if (Object.keys(ops.$unset).length === 0) {
    delete ops.$unset;
  }
  return ops;
};

module.exports.deleteFilter = function deleteDoc(options) {
  let filter = {};
  filter._id = options.id;
  filter.states = {};
  return filter;
};

/**
 *
 * @param {string} options.from
 * @param {string} options.to
 * @param {Object} options.user
 * @param {Resource} options.resource
 * @param {Object} [options.doc]
 * @returns {Promise}
 */
module.exports.setState = function setDocState(options) {
  const stateTo = getStateFromOptions(options, 'to');

  return new Promise((resolve, reject) => {
    validate(options.resource, options.doc, stateTo.validate)
      .catch(reject)
      .then(() => {
        let ops = { $rename: {}, $set: {} };
        ops.$rename[join('states', options.from)] = join('states', options.to);
        ops.$set.modifiedAt = new Date();
        ops.$set.modifiedBy = options.user ? options.user.id : null;
        return resolve(ops);
      });
  });
};
