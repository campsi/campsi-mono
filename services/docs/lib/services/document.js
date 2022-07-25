const builder = require('../modules/queryBuilder');
const embedDocs = require('../modules/embedDocs');
const paginateCursor = require('../../../../lib/modules/paginateCursor');
const sortCursor = require('../../../../lib/modules/sortCursor');
const createObjectId = require('../../../../lib/modules/createObjectId');
const permissions = require('../modules/permissions');
const { reject } = require('async');

// Helper functions
const getDocUsersList = doc => Object.keys(doc ? doc.users : []).map(k => doc.users[k]);
const getRequestedStatesFromQuery = (resource, query) => {
  return query.states ? query.states.split(',') : Object.keys(resource.states);
};

module.exports.getDocuments = function (resource, filter, user, query, state, sort, pagination, resources) {
  const queryBuilderOptions = {
    resource,
    user,
    query,
    state
  };
  const filterState = {};
  filterState[`states.${state}`] = { $exists: true };
  const dbQuery = Object.assign(filterState, filter, builder.find(queryBuilderOptions));

  const dbFields = {
    _id: 1,
    states: 1,
    users: 1,
    groups: 1
  };

  let aggregate = false;
  if (resource.isInheritable || query?.with?.includes('creator')) {
    aggregate = true;
  }

  const pipeline = [{ $match: dbQuery }];

  if (resource.isInheritable) {
    dbFields.parentId = 1;
    pipeline.push(
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
            $mergeObjects: [`$parent.states.${state}.data`, `$$ROOT.states.${state}.data`]
          }
        }
      }
    );
  }

  if (query?.with?.includes('creator')) {
    dbFields.creator = {
      _id: 1,
      displayName: 1,
      email: 1
    };

    pipeline.push(
      {
        $lookup: {
          from: '__users__',
          localField: `states.${state}.createdBy`,
          foreignField: '_id',
          as: 'tempUser'
        }
      },
      {
        $addFields: {
          creator: {
            $arrayElemAt: ['$tempUser', 0]
          }
        }
      }
    );
  }

  pipeline.push({
    $project: dbFields
  });

  const cursor = !aggregate
    ? resource.collection.find(dbQuery, { projection: dbFields })
    : resource.collection.aggregate(pipeline);
  const requestedStates = getRequestedStatesFromQuery(resource, query);
  const result = {};
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
          // eslint-disable-next-line indexof/no-indexof
          sortCursor(cursor, sort, sort.indexOf('data') === 0 ? 'states.{}.data.'.format(state) : '');
        }
        return cursor.toArray();
      })
      .then(docs => {
        result.docs = docs.map(doc => {
          const currentState = doc.states[state] || {};
          const allowedStates = permissions.getAllowedStatesFromDocForUser(user, resource, 'GET', doc);
          const states = permissions.filterDocumentStates(doc, allowedStates, requestedStates);
          const returnData = {
            id: doc._id,
            state,
            states,
            createdAt: currentState.createdAt,
            createdBy: currentState.createdBy,
            data: currentState.data || {}
          };
          if (resource.isInheritable && query?.with?.includes('parentId')) {
            returnData.parentId = doc.parentId;
          }
          if (query?.with?.includes('creator')) {
            returnData.creator = doc.creator;
          }
          return returnData;
        });
        return embedDocs.many(resource, query.embed, user, result.docs, resources);
      })
      .then(() => {
        return resolve(result);
      })
      .catch(err => {
        return reject(err);
      });
  });
};

module.exports.createDocument = function (resource, data, state, user, parentId, groups) {
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

        resource.collection.insertOne(doc, (err, result) => {
          if (err) return reject(err);
          resolve({
            state,
            id: result.insertedId,
            ...doc.states[state]
          });
        });
      })
      .catch(reject);
  });
};

module.exports.setDocument = function (resource, filter, data, state, user) {
  return new Promise((resolve, reject) => {
    builder
      .update({
        resource,
        data,
        state,
        user
      })
      .then(update => {
        resource.collection.updateOne(filter, update, (err, result) => {
          if (err) return reject(err);

          if (result.modifiedCount !== 1) {
            return reject(new Error('Not Found'));
          }
          resolve({
            id: filter._id,
            state,
            data
          });
        });
      })
      .catch(reject);
  });
};

module.exports.patchDocument = async (resource, filter, data, state, user) => {
  const update = await builder.patch({ resource, data, state, user });

  const updateDoc = await resource.collection.findOneAndUpdate(filter, update, {
    returnDocument: 'after'
  });
  if (!updateDoc.value) throw new Error('Not Found');

  return {
    id: filter._id,
    state,
    data: updateDoc.value.states[state].data
  };
};

module.exports.getDocumentLinks = function (resource, filter, query, _user, state, _resources, headers, result) {
  const nav = {};

  return new Promise((resolve, _reject) => {
    if (
      (headers &&
        (!headers['with-links'] || headers['with-links'] === 'false') &&
        (!query.withLinks || query.withLinks === 'false')) ||
      resource.isInheritable
    ) {
      return resolve({ nav, result });
    }

    const projection = { _id: 1, states: 1, users: 1, groups: 1 };

    let previous;
    let next;
    const match = { ...filter };
    match[`states.${state}`] = { $exists: true };

    // get item before
    match._id = { $lt: createObjectId(filter._id) };

    resource.collection
      .find(match, { projection })
      .sort({ _id: -1 })
      .limit(1)
      .toArray()
      .then((doc, err) => {
        // if there is an error don't build the links
        if (err) return resolve({ nav, result });

        if (doc && doc.length > 0) {
          previous = doc[0];
        }

        // find next
        match._id = { $gt: createObjectId(filter._id) };

        resource.collection
          .find(match, { projection })
          .sort({ _id: 1 })
          .limit(1)
          .toArray()
          .then((doc, err) => {
            if (!err && doc && doc.length === 1) {
              next = doc[0];
            }

            if (next && next._id) nav.next = next._id;
            if (previous && previous._id) nav.previous = previous._id;

            return resolve({ nav, result });
          })
          .catch(err => {
            console.log(err);
            return reject(err);
          });
      })
      .catch(err => {
        console.log(err);
        return reject(err);
      });
  });
};

module.exports.getDocument = function (resource, filter, query, user, state, resources, _headers) {
  const requestedStates = getRequestedStatesFromQuery(resource, query);
  const projection = { _id: 1, states: 1, users: 1, groups: 1 };
  const match = { ...filter };
  match[`states.${state}`] = { $exists: true };

  if (!resource.isInheritable) {
    return new Promise((resolve, reject) => {
      resource.collection.findOne(match, { projection }, (err, doc) => {
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
        embedDocs.one(resource, query.embed, user, returnValue.data, resources).then(_doc => {
          resolve(returnValue);
        });
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
            $mergeObjects: [`$parent.states.${state}.data`, `$$ROOT.states.${state}.data`]
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
          embedDocs.one(resource, query.embed, user, returnValue.data, resources).then(_doc => resolve(returnValue));
        })
        .catch(err => {
          reject(err);
        });
    });
  }
};

module.exports.getDocumentUsers = function (resource, filter) {
  return new Promise((resolve, reject) => {
    resource.collection.findOne(filter, { projection: { users: 1 } }, (err, doc) => {
      if (err) {
        return reject(err);
      }
      return resolve(getDocUsersList(doc));
    });
  });
};

module.exports.addUserToDocument = function (resource, filter, userDetails) {
  return new Promise((resolve, reject) => {
    resource.collection.findOne(filter, (err, document) => {
      if (err || !document) return reject(err || 'Document is null');
      const newUser = {
        roles: userDetails.roles,
        addedAt: new Date(),
        userId: createObjectId(userDetails.userId) || userDetails.userId,
        displayName: userDetails.displayName,
        infos: userDetails.infos
      };
      const ops = {
        $set: { [`users.${userDetails.userId}`]: newUser }
      };
      const options = { returnDocument: 'after', projection: { users: 1 } };
      resource.collection.findOneAndUpdate(filter, ops, options, (err, result) => {
        if (err) return reject(err);
        if (!result.value) {
          return reject(new Error('Not Found'));
        }
        resolve(getDocUsersList(result.value));
      });
    });
  });
};

module.exports.removeUserFromDocument = function (resource, filter, userId, db) {
  const removeUserFromDoc = new Promise((resolve, reject) => {
    const ops = { $unset: { [`users.${userId}`]: 1 } };
    const options = { returnDocument: 'after', projection: { users: 1 } };
    resource.collection.findOneAndUpdate(filter, ops, options, (err, result) => {
      if (err) return reject(err);
      if (!result.value) {
        return reject(new Error('Not Found'));
      }
      resolve(getDocUsersList(result.value));
    });
  });
  const groups = [`${resource.label}_${filter._id}`];
  const removeGroupFromUser = new Promise((resolve, reject) => {
    const filter = { _id: createObjectId(userId) };
    const update = { $pull: { groups: { $in: groups } } };
    db.collection('__users__').updateOne(filter, update, (err, _result) => {
      if (err) return reject(err);
      return resolve(null);
    });
  });

  return Promise.all([removeUserFromDoc, removeGroupFromUser]).then(values => values[0]);
};

module.exports.setDocumentState = function (resource, filter, fromState, toState, user) {
  return new Promise((resolve, reject) => {
    const doSetState = function (document) {
      builder
        .setState({
          doc: document,
          from: fromState,
          to: toState,
          resource,
          user
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
        .catch(reject);
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
      const allowedPutStates = permissions.getAllowedStatesFromDocForUser(user, resource, 'PUT', document);
      const allowedGetStates = permissions.getAllowedStatesFromDocForUser(user, resource, 'GET', document);
      if (allowedPutStates.includes(toState) && allowedGetStates.includes(fromState)) {
        doSetState(document.states[fromState].data);
      } else {
        reject(new Error('Unauthorized'));
      }
    });
  });
};

module.exports.deleteDocument = function (resource, filter) {
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
        Object.keys(docToDelete.states).forEach((stateName, _index) => {
          children.forEach(child => {
            if (!child.states[stateName]) {
              child.states[stateName] = docToDelete.states[stateName];
            } else {
              child.states[stateName].data = Object.assign(docToDelete.states[stateName].data, child.states[stateName].data);
            }
            delete child.parentId;
            if (docToDelete.parentId) {
              child.parentId = docToDelete.parentId;
            }
            return child;
          });
        });

        await Promise.all(children.map(async child => await resource.collection.replaceOne({ _id: child._id }, child)));
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
  const allowedStates = permissions.getAllowedStatesFromDocForUser(user, resource, 'GET', doc);

  return {
    id: doc._id,
    state,
    createdAt: currentState.createdAt,
    createdBy: currentState.createdBy,
    modifiedAt: currentState.modifiedAt,
    modifiedBy: currentState.modifiedBy,
    data: currentState.data || {},
    groups: doc.groups || [],
    states: permissions.filterDocumentStates(doc, allowedStates, requestedStates)
  };
};
