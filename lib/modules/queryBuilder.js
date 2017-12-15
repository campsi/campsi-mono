const debug = require('debug')('campsi:service:docs');
const forIn = require('for-in');

function join(...properties) {
    return properties.join('.');
}

/**
 *
 * @param {object} options
 * @param {string} [propertyName]
 * @returns {State}
 */
function getStateFromOptions(options, propertyName) {
    propertyName = propertyName || 'state';
    const stateName = options[propertyName] || options.resource.defaultState;
    let stateObj = options.resource.states[stateName] || {validate: false};
    stateObj.name = stateName;
    return stateObj;
}

/**
 *
 * @param {object} model
 * @param {object} doc
 * @param {boolean} doValidate
 * @returns {Promise}
 */
function validate(resource, doc, doValidate) {
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

module.exports.find = function find(options) {
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

// todo move and extract to use in the controller
function getStatesForUser(options) {
    const states = Object.keys(options.resource.states);
    const roles = (options.user && options.user.role) ? options.user.role : ['public'];
    let allowed = [];

    roles.forEach(function (role) {
        let permission = options.resource.permissions[role];
        states.forEach(function (state) {
            if (permission && permission[state] && (
                !options.method
                || permission[state] === '*'
                || permission[state].includes(options.method)
                )
            ) {
                allowed.push(state);
            }
        });
    });

    return allowed;
}

module.exports.select = function select(options) {
    let fields = {
        _id: 1,
    };

    let states = getStatesForUser(options);

    states.forEach(function (state) {
        fields[join('states', state, 'createdAt')] = 1;
        fields[join('states', state, 'createdBy')] = 1;
        fields[join('states', state, 'modifiedAt')] = 1;
        fields[join('states', state, 'modifiedBy')] = 1;
        fields[join('states', state, 'data')] = 1;
    });

    return fields;
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
        validate(options.resource, options.data, state.validate)
            .catch(reject)
            .then(() => {
                let doc = {states: {}};
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
module.exports.update = function updateDoc(options) {
    const state = getStateFromOptions(options);
    return new Promise((resolve, reject) => {
        validate(options.resource.model, options.data, state.validate)
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

module.exports.deleteFilter = function deleteDoc(options) {
    let filter = {};
    filter._id = options.id;
    filter.states = {};
    return filter;
};

module.exports.getStates = function getDocStates(options) {
    let fields = {
        _id: 1,
    };
    let states = getStatesForUser(options);

    states.forEach(function (state) {
        fields[join('states', state, 'createdAt')] = 1;
        fields[join('states', state, 'createdBy')] = 1;
        fields[join('states', state, 'modifiedAt')] = 1;
        fields[join('states', state, 'modifiedBy')] = 1;
    });
    return fields;
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
        validate(options.resource.model, options.doc, stateTo.validate)
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
