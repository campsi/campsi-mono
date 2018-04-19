const builder = require('../modules/queryBuilder');
const embedDocs = require('../modules/embedDocs');
const paginateCursor = require('campsi/lib/modules/paginateCursor');
const sortCursor = require('campsi/lib/modules/sortCursor');

module.exports.getDocuments = function (resource, schema, filter, user, query, state, sort, pagination) {
  const queryBuilderOptions = {
    resource: resource,
    user: user,
    query: query,
    state: state
  };

  const filterState = {};
  filterState['states.{}'.format(state)] = {$exists: true};
  const dbQuery = Object.assign(filterState, filter, builder.find(queryBuilderOptions));
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
        if (info.page > 1) {
          result.nav.previous = info.page - 1;
        }
        if (info.page < info.lastPage) {
          result.nav.next = info.page + 1;
        }
        sortCursor(cursor, sort, 'states.{}.data.'.format(state));
        return cursor.toArray();
      }).then((docs) => {
        result.docs = docs.map((doc) => {
          const currentState = doc.states[state] || {};
          return {
            id: doc._id,
            state: state,
            states: doc.states,
            createdAt: currentState.createdAt,
            createdBy: currentState.createdBy,
            data: currentState.data || {}
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

module.exports.createDocument = function (resource, data, state, user) {
  return new Promise((resolve, reject) => {
    builder.create({
      resource: resource,
      data: data,
      state: state,
      user: user
    }).then((doc) => {
      resource.collection.insert(doc, (err, result) => {
        if (err) throw err;
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

module.exports.setDocument = function (resource, filter, data, state, user) {
  return new Promise((resolve, reject) => {
    builder.update({
      resource: resource,
      data: data,
      state: state,
      user: user
    }).then((update) => {
      resource.collection.updateOne(filter, update, (err, result) => {
        if (err) return reject(err);

        if (result.modifiedCount !== 1) {
          return reject(new Error('Not Found'));
        }
        resolve({
          id: filter._id,
          state: state,
          data: data
        });
      });
    }).catch(() => {
      return reject(new Error('Validation Error'));
    });
  });
};

module.exports.getDocument = function (resource, schema, filter, query, user, state, queryStates) {
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
      if (err) return reject(err);
      if (doc === null) {
        return reject(new Error('Document Not Found'));
      }
      if (doc.states[state] === undefined) {
        return reject(new Error('Document Not Found'));
      }

      const currentState = doc.states[state] || {};
      const returnValue = {
        id: doc._id,
        state: state,
        createdAt: currentState.createdAt,
        createdBy: currentState.createdBy,
        modifiedAt: currentState.modifiedAt,
        modifiedBy: currentState.modifiedBy,
        data: currentState.data || {}
      };

      if (requestedStates.length > 0) {
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

module.exports.setDocumentState = function (resource, filter, fromState, toState, user) {
  return new Promise((resolve, reject) => {
    const doSetState = function (document) {
      builder.setState({
        doc: document,
        from: fromState,
        to: toState,
        resource: resource,
        user: user
      }).then((ops) => {
        resource.collection.updateOne(filter, ops, (err, result) => {
          if (err) return reject(err);

          if (result.modifiedCount !== 1) {
            return reject(new Error('Not Found'));
          }

          resolve({
            doc: document,
            state: {
              from: fromState,
              to: toState
            }
          });
        });
      }).catch((err) => {
        reject(err);
      });
    };

    const stateTo = resource.states[toState];
    const stateFrom = resource.states[fromState];

    if (typeof stateTo === 'undefined') {
      reject(new Error(`Undefined state: ${toState}`));
    }

    if (typeof stateFrom === 'undefined') {
      reject(new Error(`Undefined state: ${fromState}`));
    }

    if (!stateTo.validate) {
      return doSetState();
    }

    resource.collection.findOne(filter, (err, document) => {
      if (err) return reject(err);
      doSetState(document.states[fromState].data);
    });
  });
};

module.exports.getDocumentState = function (resource, filter, state, user) {
  const fields = builder.getStates({
    resource: resource,
    state: state,
    user: user
  });
  return new Promise((resolve, reject) => {
    resource.collection.findOne(filter, fields, (err, doc) => {
      if (err) reject(err);
      if (doc === null) {
        return reject(new Error('Not Found'));
      }

      resolve({
        id: doc._id,
        states: doc.states
      });
    });
  });
};

module.exports.deleteDocument = function (resource, filter, state) {
  const statePath = ['states', state].join('.');
  let updateParams = {$unset: {}};
  updateParams.$unset[statePath] = '';
  return new Promise((resolve, reject) => {
    resource.collection.findOneAndUpdate(filter, updateParams, (err, out) => {
      if (err) return reject(err);
      if (out.lastErrorObject.n === 0) return reject(new Error('Not Found'));
      let filter = builder.deleteFilter({id: out.value._id});
      resource.collection.findOneAndDelete(filter, () => {
        return resolve();
      });
    });
  });
};
