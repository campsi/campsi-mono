const builder = require('../modules/queryBuilder');
const embedDocs = require('../modules/embedDocs');
const paginateCursor = require('../../../../lib/modules/paginateCursor');
const sortCursor = require('../../../../lib/modules/sortCursor');
const createObjectID = require('../../../../lib/modules/createObjectID');
const permissions = require('../modules/permissions');

// Helper functions
const getDocUsersList = doc =>
  Object.keys(doc ? doc.users : []).map(k => doc.users[k]);
const getRequestedStatesFromQuery = (resource, query) => {
  return query.states ? query.states.split(',') : Object.keys(resource.states);
};

module.exports.getDocuments = function(
  resource,
  filter,
  user,
  query,
  state,
  sort,
  pagination
) {
  const queryBuilderOptions = {
    resource: resource,
    user: user,
    query: query,
    state: state
  };
  const filterState = {};
  filterState[`states.${state}`] = { $exists: true };
  const dbQuery = Object.assign(
    filterState,
    filter,
    builder.find(queryBuilderOptions)
  );
  const dbFields = { _id: 1, states: 1, users: 1, groups: 1 };
  const pipeline = !resource.isInheritable
    ? null
    : [
        { $match: dbQuery },
        {
          $graphLookup: {
            from: resource.collection.collectionName,
            startWith: '$parentId',
            connectFromField: 'parentId',
            connectToField: '_id',
            as: 'parents'
          }
        },
        {
          $addFields: {
            parent: {
              $reduce: {
                input: '$parents',
                initialValue: {},
                in: {
                  $mergeObjects: {
                    $reverseArray: '$parents'
                  }
                }
              }
            }
          }
        },
        {
          $addFields: {
            [`states.${state}.data`]: {
              $mergeObjects: [
                `$parent.states.${state}.data`,
                `$$ROOT.states.${state}.data`
              ]
            }
          }
        },
        {
          $project: {
            parents: 0,
            parent: 0
          }
        }
      ];

  const cursor = !pipeline
    ? resource.collection.find(dbQuery, dbFields)
    : resource.collection.aggregate(pipeline);
  const requestedStates = getRequestedStatesFromQuery(resource, query);
  let result = {};
  return new Promise((resolve, reject) => {
    paginateCursor(cursor, pagination)
      .then(info => {
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
        if (sort) {
          sortCursor(
            cursor,
            sort,
            sort.indexOf('data') === 0 ? 'states.{}.data.'.format(state) : ''
          );
        }
        return cursor.toArray();
      })
      .then(docs => {
        result.docs = docs.map(doc => {
          const currentState = doc.states[state] || {};
          const allowedStates = permissions.getAllowedStatesFromDocForUser(
            user,
            resource,
            'GET',
            doc
          );
          const states = permissions.filterDocumentStates(
            doc,
            allowedStates,
            requestedStates
          );
          return {
            id: doc._id,
            state: state,
            states: states,
            createdAt: currentState.createdAt,
            createdBy: currentState.createdBy,
            data: currentState.data || {}
          };
        });
        return embedDocs.many(resource, query.embed, user, result.docs);
      })
      .then(() => {
        return resolve(result);
      })
      .catch(err => {
        return reject(err);
      });
  });
};

module.exports.createDocument = function(
  resource,
  data,
  state,
  user,
  parentId,
  groups
) {
  return new Promise((resolve, reject) => {
    builder
      .create({
        resource,
        data,
        state,
        user,
        parentId
      })
      .then(async doc => {
        if (doc.parentId) {
          try {
            const parent = await resource.collection.findOne({
              _id: doc.parentId
            });
            if (parent) {
              doc.groups = parent.groups;
            }
          } catch (err) {}
        }

        if (groups.length) {
          doc.groups = [...new Set([...doc.groups, ...groups])];
        }

        await resource.collection.insertOne(doc, (err, result) => {
          if (err) throw err;
          resolve(
            Object.assign(
              {
                state: state,
                id: result.ops[0]._id
              },
              result.ops[0].states[state]
            )
          );
        });
      })
      .catch(error => {
        return reject(error);
      });
  });
};

module.exports.setDocument = function(resource, filter, data, state, user) {
  return new Promise((resolve, reject) => {
    builder
      .update({
        resource: resource,
        data: data,
        state: state,
        user: user
      })
      .then(update => {
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
      })
      .catch(() => {
        return reject(new Error('Validation Error'));
      });
  });
};

module.exports.patchDocument = (resource, filter, data, state, user) => {
  return new Promise((resolve, reject) => {
    builder
      .patch({
        resource: resource,
        data: data,
        state: state,
        user: user
      })
      .then(update => {
        console.log(update);
        resource.collection.findOneAndUpdate(
          filter,
          update,
          { returnDocument: 'after' },
          (err, result) => {
            if (err) return reject(err);

            if (!result.value) {
              return reject(new Error('Not Found'));
            }
            resolve({
              id: filter._id,
              state: state,
              data: result.value.states[state].data
            });
          }
        );
      })
      .catch(() => {
        return reject(new Error('Validation Error'));
      });
  });
};

module.exports.getDocument = function(resource, filter, query, user, state) {
  const requestedStates = getRequestedStatesFromQuery(resource, query);
  const fields = { _id: 1, states: 1, users: 1, groups: 1 };
  const match = { ...filter };
  match[`states.${state}`] = { $exists: true };

  if (!resource.isInheritable) {
    return new Promise((resolve, reject) => {
      resource.collection.findOne(match, { projection: fields }, (err, doc) => {
        if (err) return reject(err);
        if (doc === null) {
          return reject(new Error('Document Not Found'));
        }
        if (doc.states[state] === undefined) {
          return reject(new Error('Document Not Found'));
        }
        const returnValue = prepareGetDocument({
          doc,
          state,
          permissions,
          requestedStates,
          resource,
          user
        });
        embedDocs
          .one(resource, resource.schema, query.embed, user, returnValue.data)
          .then(() => resolve(returnValue));
      });
    });
  } else {
    const pipeline = [
      {
        $match: match
      },
      {
        $graphLookup: {
          from: resource.collection.collectionName,
          startWith: '$parentId',
          connectFromField: 'parentId',
          connectToField: '_id',
          as: 'parents'
        }
      },
      {
        $addFields: {
          parent: {
            $reduce: {
              input: '$parents',
              initialValue: {},
              in: { $mergeObjects: { $reverseArray: '$parents' } }
            }
          }
        }
      },
      {
        $addFields: {
          [`states.${state}.data`]: {
            $mergeObjects: [
              `$parent.states.${state}.data`,
              `$$ROOT.states.${state}.data`
            ]
          }
        }
      },
      {
        $project: {
          parents: 0,
          parent: 0
        }
      }
    ];

    return new Promise((resolve, reject) => {
      resource.collection
        .aggregate(pipeline)
        .toArray()
        .then(documents => {
          if (!documents || documents.length === 0) {
            return reject(new Error('Document Not Found'));
          }
          const doc = documents[0];
          const returnValue = prepareGetDocument({
            doc,
            state,
            permissions,
            requestedStates,
            resource,
            user
          });
          embedDocs
            .one(resource, resource.schema, query.embed, user, returnValue.data)
            .then(() => resolve(returnValue));
        })
        .catch(err => {
          reject(err);
        });
    });
  }
};

module.exports.getDocumentUsers = function(resource, filter) {
  return new Promise((resolve, reject) => {
    resource.collection.findOne(
      filter,
      { projection: { users: 1 } },
      (err, doc) => {
        if (err) {
          return reject(err);
        }
        return resolve(getDocUsersList(doc));
      }
    );
  });
};

module.exports.addUserToDocument = function(resource, filter, userDetails) {
  return new Promise((resolve, reject) => {
    resource.collection.findOne(filter, (err, document) => {
      if (err || !document) return reject(err || 'Document is null');
      const newUser = {
        roles: userDetails.roles,
        addedAt: new Date(),
        userId: createObjectID(userDetails.userId) || userDetails.userId,
        displayName: userDetails.displayName,
        infos: userDetails.infos
      };
      const ops = {
        $set: { [`users.${userDetails.userId}`]: newUser }
      };
      const options = { returnOriginal: false, projection: { users: 1 } };
      resource.collection.findOneAndUpdate(
        filter,
        ops,
        options,
        (err, result) => {
          if (err) return reject(err);
          if (!result.value) {
            return reject(new Error('Not Found'));
          }
          resolve(getDocUsersList(result.value));
        }
      );
    });
  });
};

module.exports.removeUserFromDocument = function(
  resource,
  filter,
  userId,
  groups,
  db
) {
  const removeUserFromDoc = new Promise((resolve, reject) => {
    const ops = { $unset: { [`users.${userId}`]: 1 } };
    const options = { returnOriginal: false, projection: { users: 1 } };
    resource.collection.findOneAndUpdate(
      filter,
      ops,
      options,
      (err, result) => {
        if (err) return reject(err);
        if (!result.value) {
          return reject(new Error('Not Found'));
        }
        resolve(getDocUsersList(result.value));
      }
    );
  });
  const removeGroupFromUser = !groups.length
    ? Promise.resolve(null)
    : new Promise((resolve, reject) => {
        const filter = { _id: createObjectID(userId) };
        const update = { $pull: { groups: { $in: groups } } };
        db.collection('__users__').updateOne(filter, update, (err, result) => {
          if (err) return reject(err);
          return resolve(null);
        });
      });

  return Promise.all([removeUserFromDoc, removeGroupFromUser]).then(
    values => values[0]
  );
};

module.exports.setDocumentState = function(
  resource,
  filter,
  fromState,
  toState,
  user
) {
  return new Promise((resolve, reject) => {
    const doSetState = function(document) {
      builder
        .setState({
          doc: document,
          from: fromState,
          to: toState,
          resource: resource,
          user: user
        })
        .then(ops => {
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
        })
        .catch(err => {
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

    resource.collection.findOne(filter, (err, document) => {
      if (err) return reject(err);
      const allowedPutStates = permissions.getAllowedStatesFromDocForUser(
        user,
        resource,
        'PUT',
        document
      );
      const allowedGetStates = permissions.getAllowedStatesFromDocForUser(
        user,
        resource,
        'GET',
        document
      );
      if (
        allowedPutStates.includes(toState) &&
        allowedGetStates.includes(fromState)
      ) {
        doSetState(document.states[fromState].data);
      } else {
        reject(new Error('Unauthorized'));
      }
    });
  });
};

module.exports.deleteDocument = function(resource, filter) {
  if (!resource.isInheritable) {
    return resource.collection.deleteOne(filter);
  } else {
    return resource.collection
      .findOne(filter)
      .then(async docToDelete => {
        const children = await getDocumentChildren(filter._id, resource);
        if (!children.length) {
          await resource.collection.deleteOne(filter);
          return {};
        }
        Object.keys(docToDelete.states).forEach((stateName, index) => {
          children.forEach(child => {
            if (!child.states[stateName]) {
              child.states[stateName] = docToDelete.states[stateName];
            } else {
              child.states[stateName].data = Object.assign(
                docToDelete.states[stateName].data,
                child.states[stateName].data
              );
            }
            delete child.parentId;
            if (!!docToDelete.parentId) {
              child.parentId = docToDelete.parentId;
            }
            return child;
          });
        });

        await Promise.all(
          children.map(
            async child =>
              await resource.collection.replaceOne({ _id: child._id }, child)
          )
        );
        await resource.collection.deleteOne(filter);
        return {};
      })
      .catch(err => err);
  }
};

const getDocumentChildren = async (documentId, resource) => {
  return await resource.collection
    .aggregate([
      {
        $match: {
          parentId: documentId
        }
      }
    ])
    .toArray();
};

const prepareGetDocument = settings => {
  const { doc, state, permissions, requestedStates, resource, user } = settings;
  const currentState = doc.states[state] || {};
  const allowedStates = permissions.getAllowedStatesFromDocForUser(
    user,
    resource,
    'GET',
    doc
  );

  return {
    id: doc._id,
    state: state,
    createdAt: currentState.createdAt,
    createdBy: currentState.createdBy,
    modifiedAt: currentState.modifiedAt,
    modifiedBy: currentState.modifiedBy,
    data: currentState.data || {},
    groups: doc.groups || [],
    states: permissions.filterDocumentStates(
      doc,
      allowedStates,
      requestedStates
    )
  };
};
