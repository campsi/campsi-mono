const debug = require('debug')('campsi:service:docs');
const forIn = require('for-in');

/**
 * Simple utility function that converts a list of arguments
 * into a dot notation string
 * @param {string} properties
 * @return {string}
 */
function join (...properties) {
  return properties.join('.');
}
/**
 * Retreive the state object descriptor from its name
 * @param {object} options
 * @param {string} [propertyName]
 * @returns {State}
 */
function getStateFromOptions (options, propertyName) {
  propertyName = propertyName || 'state';
  const stateName = options[propertyName] || options.resource.defaultState;
  let stateObj = options.resource.states[stateName] || {validate: false};
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
function validate (resource, doc, doValidate) {
  return new Promise((resolve, reject) => {
    if (doValidate !== true) {
      return resolve();
    }
    if (resource.validate(doc)) {
      return resolve();
    } else {
      debug('model have %d error(s)', resource.validate.errors.length);
      return reject(resource.validate.errors);
    }
  });
}

module.exports.find = function find (options) {
  let state = getStateFromOptions(options);
  let filter = {};

  if (options.query) {
    forIn(options.query, (val, prop) => {
      if (prop.startsWith('data.')) {
        filter[join('states', state.name, prop)] = val;
      }
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
module.exports.create = function createDoc (options) {
  const state = getStateFromOptions(options);

  return new Promise((resolve, reject) => {
    validate(options.resource, options.data, state.validate)
      .catch(reject)
      .then(() => {
        let doc = {
          users: {},
          states: {}
        };

        if (options.user) {
          doc.users[String(options.user._id)] = {
            roles: ['owner'],
            addedAt: new Date(),
            userId: options.user._id
          };
        }
        doc.states[state.name] = {
          createdAt: new Date(),
          createdBy: options.user ? options.user._id : null,
          data: options.data
        };
        resolve(doc);
      });
  });
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
module.exports.update = function updateDoc (options) {
  const state = getStateFromOptions(options);
  return new Promise((resolve, reject) => {
    validate(options.resource, options.data, state.validate)
      .catch(reject)
      .then(() => {
        let ops = {$set: {}};
        ops.$set[join('states', state.name, 'modifiedAt')] = new Date();
        ops.$set[join('states', state.name, 'modifiedBy')] = options.user ? options.user.id : null;
        ops.$set[join('states', state.name, 'data')] = options.data;
        return resolve(ops);
      });
  });
};

module.exports.deleteFilter = function deleteDoc (options) {
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
module.exports.setState = function setDocState (options) {
  const stateTo = getStateFromOptions(options, 'to');

  return new Promise((resolve, reject) => {
    validate(options.resource, options.doc, stateTo.validate)
      .catch(reject)
      .then(() => {
        let ops = {$rename: {}, $set: {}};
        ops.$rename[join('states', options.from)] = join('states', options.to);
        ops.$set.modifiedAt = new Date();
        ops.$set.modifiedBy = options.user ? options.user.id : null;
        return resolve(ops);
      });
  });
};
