const debug = require('debug')('campsi:service:docs');
const { ObjectId } = require('mongodb');
const ValidationError = require('../../../../lib/errors/ValidationError');
const sanitizeHTMLFromXSS = require('../../../../lib/modules/sanitize');
const dot = require('dot-object');

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
  const state = options.resource.states[stateName] || { validate: false };
  state.name = stateName;
  return state;
}

/**
 * Validate a document against its resource
 * @param {object} resource
 * @param {object} doc
 * @param {boolean} doValidate
 * @returns {Promise}
 */
function validate(resource, doc, doValidate) {
  return new Promise((resolve, reject) => {
    if (doValidate !== true) {
      return resolve(true);
    }
    if (resource.validate(doc)) {
      return resolve(true);
    } else {
      debug('model have %d error(s)', resource.validate.errors.length);
      return reject(new ValidationError(resource.validate.errors));
    }
  });
}

/**
 * LHS brackets operator on strings
 * All those example filters match 'campsi'
 * - data.field[starts-with]=cam
 * - data.field[ends-with]=psi
 * - data.field[contains]=amps
 * A priority is applied if multiple filter are present in query (starts > ends > contains)
 * @param filters dictionary of filters to fill
 * @param key filter key
 * @param value value to parse
 */
function stringOperators(filters, key, value) {
  // Our test ensure that value is an object we can use with hasOwnProperty, so we disable this rule
  /* eslint-disable no-prototype-builtins */
  if (value.hasOwnProperty('starts-with')) {
    filters[key] = { $regex: `^${value['starts-with']}.*`, $options: 'i' };
  } else if (value.hasOwnProperty('ends-with')) {
    filters[key] = { $regex: `.*${value['ends-with']}$`, $options: 'i' };
  } else if (value.hasOwnProperty('contains')) {
    filters[key] = { $regex: `.*${value.contains}.*`, $options: 'i' };
  }
  /* eslint-enable no-prototype-builtins */
}
module.exports.stringOperators = stringOperators;

/**
 * LHS brackets operator on number
 * eq: equal
 * gt: greater than
 * lt: less than
 * gte: greater than or equal
 * lte: less than or equal
 * All numbers operator are applied (no priority)
 * @param filters dictionary of filters to fill
 * @param key filter key
 * @param value value to parse
 */
function numberOperators(filters, key, value) {
  // Our test ensure that value is an object we can use with hasOwnProperty, so we disable this rule
  /* eslint-disable no-prototype-builtins */
  const filter = {};
  if (value.hasOwnProperty('eq')) {
    filter.$eq = Number(value.eq);
  }
  if (value.hasOwnProperty('gt')) {
    filter.$gt = Number(value.gt);
  }
  if (value.hasOwnProperty('lt')) {
    filter.$lt = Number(value.lt);
  }
  if (value.hasOwnProperty('gte')) {
    filter.$gte = Number(value.gte);
  }
  if (value.hasOwnProperty('lte')) {
    filter.$lte = Number(value.lte);
  }
  if (value.hasOwnProperty('in')) {
    filter.$in = value.in.split(',').map(Number);
  }
  if (Object.keys(filter).length) {
    filters[key] = filter;
  }
  /* eslint-enable no-prototype-builtins */
}
module.exports.numberOperators = numberOperators;

/**
 * LHS brackets operator on date
 * before / after
 * All dates operator are applied (no priority)
 * @param filters dictionary of filters to fill
 * @param key filter key
 * @param value value to parse
 */
function dateOperators(filters, key, value) {
  // Our test ensure that value is an object we can use with hasOwnProperty, so we disable this rule
  /* eslint-disable no-prototype-builtins */
  const filter = {};
  if (value.hasOwnProperty('before')) {
    filter.$lt = new Date(value.before);
  }
  if (value.hasOwnProperty('after')) {
    filter.$gt = new Date(value.after);
  }
  if (Object.keys(filter).length) {
    filters[key] = filter;
  }
  /* eslint-enable no-prototype-builtins */
}
module.exports.dateOperators = dateOperators;

/**
 * LHS brackets operator on boolean
 * bool: equal true or false
 * @param filters dictionary of filters to fill
 * @param key filter key
 * @param value value to parse
 */
function boolOperators(filters, key, value) {
  // Our test ensure that value is an object we can use with hasOwnProperty, so we disable this rule
  /* eslint-disable no-prototype-builtins */
  if (value.hasOwnProperty('bool')) {
    filters[key] = value.bool.toLowerCase() === 'true';
  }
  /* eslint-enable no-prototype-builtins */
}
module.exports.boolOperators = boolOperators;

/**
 * Miscellaneous LHS brackets operators
 * exists: test if property exists or not
 * @param filters dictionary of filters to fill
 * @param key filter key
 * @param value value to parse
 */
function specialOperators(filters, key, value) {
  // Our test ensure that value is an object we can use with hasOwnProperty, so we disable this rule
  /* eslint-disable no-prototype-builtins */
  if (value.hasOwnProperty('exists')) {
    // 'exists' operator
    filters[key] = { $exists: value.exists.toLowerCase() === 'true' };
  }
  /* eslint-enable no-prototype-builtins */
}
module.exports.specialOperators = specialOperators;

/**
 * This function transforms the query string into a MongoDb `$match` filter.
 * It uses simple match, array match and LHS Brackets operator defined in previous functions
 * CSS syntax defined below is deprecated
 * If the query string uses CSS-like notation for attributes, the `$match`
 * will be a `$regex`, case-insensitive. Available forms are the following:
 * - `"data.name=omai"`, *exact* => will __NOT__ match Romain
 * - `"data.name*=omai"`, *contain* operator => will match Romain
 * - `"data.name^=axe"`, *startsWith* operator => will match Axeptio
 * - `"data.name$=tion"`, *endWith* operator => will match Agilitation
 * @param options
 * @returns {{}}
 */
module.exports.find = function find(options) {
  if (!options.query) {
    return {};
  }
  const state = getStateFromOptions(options);

  return Object.entries(options.query)
    .filter(([name]) => name.startsWith('data.') && name.length > 5)
    .reduce((filters, [name, value]) => {
      const key = join('states', state.name, name);
      if (value === null) {
        // Just in case, do nothing
      } else if (Array.isArray(value)) {
        // 'In' string operator
        filters[key] = { $in: value.map(String) };
      } else if (typeof value === 'object') {
        // Add filters by LHS Brackets operator
        stringOperators(filters, key, value);
        numberOperators(filters, key, value);
        dateOperators(filters, key, value);
        boolOperators(filters, key, value);
        specialOperators(filters, key, value);
      } else {
        switch (name.slice(-1)) {
          case '*':
            // CSS contains
            filters[key.slice(0, -1)] = { $regex: `.*${value}.*`, $options: 'i' };
            break;
          case '^':
            // CSS starts with
            filters[key.slice(0, -1)] = { $regex: `^${value}.*`, $options: 'i' };
            break;
          case '$':
            // CSS ends with
            filters[key.slice(0, -1)] = { $regex: `.*${value}$`, $options: 'i' };
            break;
          default:
            // String Simple Match
            filters[key] = value;
            break;
        }
      }
      return filters;
    }, {});
};
/**
 *
 * @param {Object} options.data
 * @param {Resource} options.resource
 * @param {String} [options.state]
 * @param {User} [options.user]
 * @returns {Promise}
 */
module.exports.create = function createDoc(options) {
  const state = getStateFromOptions(options);

  return new Promise((resolve, reject) => {
    return validate(options.resource, options.data, state.validate)
      .catch(reject)
      .then(() => {
        const doc = {
          users: {},
          states: {},
          groups: []
        };
        if (options.parentId) {
          doc.parentId = new ObjectId(options.parentId);
        }

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
          data: sanitizeHTMLFromXSS(options.data)
        };
        return resolve(doc);
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
module.exports.update = function updateDoc(options) {
  const state = getStateFromOptions(options);
  return new Promise((resolve, reject) => {
    return validate(options.resource, options.data, state.validate)
      .catch(reject)
      .then(() => {
        const ops = { $set: {} };
        ops.$set[join('states', state.name, 'modifiedAt')] = new Date();
        ops.$set[join('states', state.name, 'modifiedBy')] = options.user ? options.user._id : null;
        ops.$set[join('states', state.name, 'data')] = sanitizeHTMLFromXSS(options.data);
        return resolve(ops);
      });
  });
};

module.exports.patch = async options => {
  const state = getStateFromOptions(options);
  await validatePatchedDocument(options);

  const ops = { $set: {}, $unset: {} };
  ops.$set[join('states', state.name, 'modifiedAt')] = new Date();
  ops.$set[join('states', state.name, 'modifiedBy')] = options.user ? options.user._id : null;

  for (const [key, value] of Object.entries(options.data)) {
    const operator = value === null || value === undefined ? '$unset' : '$set';
    ops[operator][join('states', state.name, 'data', key)] = value;
  }

  if (Object.keys(ops.$unset).length === 0) {
    delete ops.$unset;
  }
  return ops;
};

const patchAJsonDoc = (originalJson, patchData) => {
  Object.keys(patchData).forEach(key => {
    dot.str(key, patchData[key], originalJson);
  });

  return originalJson;
};

/**
 * @param {Object}  options
 * @param {Resource} options.resource
 * @param {Object} options.data
 * @param {String} options.state
 * @returns {Promise<void>}
 */
const validatePatchedDocument = async options => {
  const state = getStateFromOptions(options);
  await validate(
    options.resource,
    sanitizeHTMLFromXSS(
      options.originalRawDocument
        ? patchAJsonDoc(options.originalRawDocument.states[state.name].data, options.data)
        : options.data
    ),
    state.validate
  );
};

module.exports.deleteFilter = function deleteDoc(options) {
  const filter = {};
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
    return validate(options.resource, options.doc.states[options.from].data, stateTo.validate)
      .catch(reject)
      .then(() => {
        const ops = { $rename: {}, $set: {} };
        ops.$rename[join('states', options.from)] = join('states', options.to);
        ops.$set.modifiedAt = new Date();
        ops.$set.modifiedBy = options.user ? options.user.id : null;
        return resolve(ops);
      });
  });
};

module.exports = {
  ...module.exports,
  validatePatchedDocument,
  patchAJsonDoc
};
