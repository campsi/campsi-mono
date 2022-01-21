const builder = require('../modules/queryBuilder');
const embedDocs = require('../modules/embedDocs');
const paginateCursor = require('../../../../lib/modules/paginateCursor');
const sortCursor = require('../../../../lib/modules/sortCursor');
const createObjectId = require('../../../../lib/modules/createObjectId');
const permissions = require('../modules/permissions');

// Helper functions
const getDocUsersList = doc =>
  Object.keys(doc ? doc.users : []).map(k => doc.users[k]);

module.exports.getDocuments = async (
  resource,
  filter,
  user,
  query,
  sort,
  pagination,
  resources
) => {
  const queryBuilderOptions = {
    resource: resource,
    user: user,
    query: query
  };

  const dbQuery = { ...filter, ...builder.find(queryBuilderOptions) };

  let aggregate = query?.with?.includes('creator') || false;

  const pipeline = [{ $match: dbQuery }];

  if (query?.with?.includes('creator')) {
    pipeline.push(
      {
        $lookup: {
          from: '__users__',
          localField: 'createdBy',
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
      },
      {
        $project: {
          tempUser: 0
        }
      }
    );
  }

  const cursor = !aggregate
    ? resource.currentCollection.find(dbQuery)
    : resource.currentCollection.aggregate(pipeline);

  let result = {};

  const { count, page, lastPage, perPage } = await paginateCursor(
    cursor,
    pagination
  );
  result = {
    ...result,
    count,
    page,
    perPage,
    label: resource.label,
    nav: {
      first: 1,
      last: lastPage,
      previous: page > 1 ? page - 1 : undefined,
      next: page < lastPage ? page + 1 : undefined
    }
  };
  if (sort) {
    sortCursor(cursor, sort, '');
  }
  result.docs = await cursor.toArray();
  return result;
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
            const parent = await resource.currentCollection.findOne({
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

        resource.currentCollection.insertOne(doc, (err, result) => {
          if (err) return reject(err);
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
        resource.currentCollection.updateOne(filter, update, (err, result) => {
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

module.exports.patchDocument = async (resource, filter, data, state, user) => {
  const update = await builder.patch({ resource, data, state, user });

  const updateDoc = await resource.currentCollection.findOneAndUpdate(
    filter,
    update,
    {
      returnDocument: 'after'
    }
  );
  if (!updateDoc.value) throw new Error('Not Found');

  return {
    id: filter._id,
    state: state,
    data: updateDoc.value.states[state].data
  };
};

module.exports.getDocument = function(
  resource,
  filter,
  query,
  user,
  state,
  resources
) {
  const requestedStates = getRequestedStatesFromQuery(resource, query);
  const fields = { _id: 1, states: 1, users: 1, groups: 1 };
  const match = { ...filter };
  match[`states.${state}`] = { $exists: true };

  if (!resource.isInheritable) {
    return new Promise((resolve, reject) => {
      resource.currentCollection.findOne(
        match,
        { projection: fields },
        (err, doc) => {
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
            .one(resource, query.embed, user, returnValue.data, resources)
            .then(doc => {
              resolve(returnValue);
            });
        }
      );
    });
  } else {
    const pipeline = [
      {
        $match: match
      },
      {
        $graphLookup: {
          from: resource.currentCollection.collectionName,
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
      resource.currentCollection
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
            .one(resource, query.embed, user, returnValue.data, resources)
            .then(doc => resolve(returnValue));
        })
        .catch(err => {
          reject(err);
        });
    });
  }
};

module.exports.getDocumentUsers = async (resource, filter) => {
  const doc = await resource.currentCollection.findOne(filter, {
    projection: { users: 1 }
  });
  return getDocUsersList(doc);
};

module.exports.addUserToDocument = async (resource, filter, userDetails) => {
  const document = resource.currentCollection.findOne(filter);
  if (!document) return null;
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
  const doc = await resource.currentCollection.findOneAndUpdate(
    filter,
    ops,
    options
  );
  return getDocUsersList(doc.value);
};

module.exports.removeUserFromDocument = async (
  resource,
  filter,
  userId,
  db
) => {
  const removeUserFromDoc = new Promise((resolve, reject) => {
    const ops = { $unset: { [`users.${userId}`]: 1 } };
    const options = { returnDocument: 'after', projection: { users: 1 } };
    resource.currentCollection.findOneAndUpdate(
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

  const removeGroupFromUser = new Promise((resolve, reject) => {
    const filter = { _id: createObjectId(userId) };
    const update = {
      $pull: { groups: { $in: [`${resource.label}_${filter._id}`] } }
    };
    db.collection('__users__').updateOne(filter, update, (err, result) => {
      if (err) return reject(err);
      return resolve(null);
    });
  });

  return await Promise.all([removeUserFromDoc, removeGroupFromUser]).then(
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
          resource.currentCollection.updateOne(filter, ops, (err, result) => {
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

    resource.currentCollection.findOne(filter, (err, document) => {
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
    return resource.currentCollection.deleteOne(filter);
  } else {
    return resource.currentCollection
      .findOne(filter)
      .then(async docToDelete => {
        const children = await getDocumentChildren(filter._id, resource);
        if (!children.length) {
          await resource.currentCollection.deleteOne(filter);
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
              await resource.currentCollection.replaceOne(
                { _id: child._id },
                child
              )
          )
        );
        await resource.currentCollection.deleteOne(filter);
        return {};
      })
      .catch(err => err);
  }
};

const getDocumentChildren = async (documentId, resource) => {
  return await resource.currentCollection
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
