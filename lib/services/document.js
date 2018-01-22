const builder = require('../modules/queryBuilder');
const embedDocs = require('../modules/embedDocs');
const paginateCursor = require('campsi/lib/modules/paginateCursor');
const sortCursor = require('campsi/lib/modules/sortCursor');

module.exports.getDocuments = function(resource, schema, filter, user, query, state, sort, pagination) {
    const queryBuilderOptions = {
        resource: resource,
        user: user,
        query: query,
        state: state
    };

    const dbQuery = Object.assign({}, filter, builder.find(queryBuilderOptions));
    const dbFields = builder.select(queryBuilderOptions);

    const cursor = resource.collection.find(dbQuery, dbFields);

    let result = {};
    return new Promise((resolve, reject) => {
        paginateCursor(cursor, pagination)
            .then((info) => {
                result.count = info.count;
                result.label = resource.label;
                result.page = info.page;
                result.perPage = info.perPage;
                result.nav = {};
                result.nav.first = 1;
                result.nav.last = info.lastPage;
                if(info.page > 1) {
                    result.nav.previous = info.page - 1;
                }
                if(info.page < info.lastPage) {
                    result.nav.next = info.page + 1;
                }
                sortCursor(cursor, sort, 'states.{}.data.'.format(state));
                return cursor.toArray();
            }).then((docs) => {
                result.docs = docs.map((doc) => {
                    const fallbackState = Object.keys(doc.states)[0];
                    const currentState = doc.states[state] || doc.states[fallbackState];
                    return {
                        id: doc._id,
                        state: doc.states[state] ? state : fallbackState,
                        states: doc.states,
                        createdAt: currentState.createdAt,
                        createdBy: currentState.createdBy,
                        data: currentState.data || {},
                    };
                });
                return embedDocs.many(resource, schema, query.embed, user, result.docs);
            }).then(() => {
                return resolve(result);
            }).catch((err) => {
                return reject(err);
            });
    });
};

module.exports.createDocument = function(resource, data, state, user) {
    return new Promise((resolve, reject) => {
        builder.create({
            resource: resource,
            data: data,
            state: state,
            user: user
        }).then((doc) => {
            resource.collection.insert(doc, (err, result) => {
                resolve(
                    Object.assign({
                        state: state,
                        id: result.ops[0]._id
                    }, result.ops[0].states[state])
                );
            });
        }).catch((error) => {
            return reject(error);
        });
    });
};

module.exports.setDocument = function(resource, filter, data, state, user) {
    return new Promise((resolve, reject) => {
        builder.update({
            resource: resource,
            data: data,
            state: state,
            user: user
        }).then((update) => {
            resource.collection.updateOne(filter, update, (error, result) => {
                if (error) {
                    return reject('generic', error);
                }

                if (result.modifiedCount !== 1) {
                    return reject('notFound');
                }
                resolve({
                    id: filter._id,
                    state: state,
                    data: data
                });
            });
        }).catch(() => {
            return reject('validation');
        });
    });
};

module.exports.getDocument = function(resource, schema, filter, query, user, state, queryStates) {
    let requestedStates = queryStates;
    requestedStates = requestedStates === '' ? Object.keys(resource.states) : requestedStates;
    requestedStates = requestedStates === undefined ? [] : requestedStates;
    requestedStates = Array.isArray(requestedStates) ? requestedStates : [requestedStates];

    const fields = builder.select({
        method: 'GET',
        resource: resource,
        user: user,
        query: query,
        state: [...new Set(requestedStates.concat(state))]
    });

    return new Promise((resolve, reject) => {
        resource.collection.findOne(filter, fields, (err, doc) => {
            if (doc === null) {
                return reject();
            }
            if (doc.states[state] === undefined) {
                return reject();
            }

            const currentState = doc.states[state] || {};
            const returnValue = {
                id: doc._id,
                state: state,
                createdAt: currentState.createdAt,
                createdBy: currentState.createdBy,
                modifiedAt: currentState.modifiedAt,
                modifiedBy: currentState.modifiedBy,
                data: currentState.data || {},
            };

            if(requestedStates.length > 0) {
                returnValue.states = Object.keys(doc.states)
                    .filter(docState => requestedStates.includes(docState))
                    .reduce((displayStates, displayState) => {
                        displayStates[displayState] = doc.states[displayState];
                        return displayStates;
                    }, {});
            }

            embedDocs.one(resource, schema, query.embed, user, returnValue.data)
                .then(() => resolve(returnValue));
        });
    });
};

module.exports.setDocumentState = function(resource, filter, fromState, toState, user) {

    return new Promise((resolve, reject) => {
        const doSetState = function (document) {
            builder.setState({
                doc: document,
                from: fromState,
                to: toState,
                resource: resource,
                user: user
            }).then((ops) => {
                resource.collection.updateOne(filter, ops, (error, result) => {
                    if (error) {
                        return reject('generic', error);
                    }

                    if (result.modifiedCount !== 1) {
                        return reject('notFound');
                    }

                    resolve({
                        id: result.ops[0]._id,
                        state: {
                            from: fromState,
                            to: toState
                        }
                    });
                });
            }).catch(reject('validation'));
        };

        const stateTo = resource.states[toState];
        const stateFrom = resource.states[fromState];

        if (typeof stateTo === 'undefined') {
            reject('generic', {message: 'Undefined state', state: toState});
        }

        if (typeof stateFrom === 'undefined') {
            reject('generic', {message: 'Undefined state', state: fromState});
        }

        if (!stateTo.validate) {
            return doSetState();
        }

        resource.collection.findOne(filter, (error, document) => {
            doSetState(document.states[fromState].data);
        });
    });
};

module.exports.getDocumentState = function(resource, filter, state, user) {
    const fields = builder.getStates({
        resource: resource,
        state: state,
        user: user
    });
    return new Promise((resolve, reject) => {
        resource.collection.findOne(filter, fields, (err, doc) => {
            if (doc === null) {
                return reject();
            }

            resolve({
                id: doc._id,
                states: doc.states,
            });
        });
    });
};

module.exports.deleteDocument = function(resource, filter, state) {
    const statePath = ['states', state].join('.');
    let updateParams = {$unset: {}};
    updateParams.$unset[statePath] = '';
    return new Promise((resolve, reject) => {
        resource.collection.findOneAndUpdate(filter, updateParams, (err, out) => {
            if (err) {
                return reject(err);
            }
            if (out.lastErrorObject.n === 0) {
                return reject();
            }
            let filter = builder.deleteFilter({id: out.value._id});
            resource.collection.findOneAndDelete(filter, () => {
                return resolve();
            });
        });
    });
};
