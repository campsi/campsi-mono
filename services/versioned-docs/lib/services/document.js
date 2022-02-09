const { diff } = require('just-diff');
const { ObjectId } = require('mongodb');
const builder = require('../modules/queryBuilder');
const paginateCursor = require('../../../../lib/modules/paginateCursor');
const sortCursor = require('../../../../lib/modules/sortCursor');
const createObjectId = require('../../../../lib/modules/createObjectId');
const createError = require('http-errors');

// Helper functions
const getDocUsersList = doc =>
  Object.keys(doc ? doc.users : []).map(k => doc.users[k]);

const getDocumentDataOnly = doc => {
  const {
    _id,
    revision,
    users,
    groups,
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
    ...data
  } = doc;

  // ObjectId are stored as ObjectId in DB, but related properties are received as string in payload. We need them all as string for further diff
  Object.entries(data).map(([key, value]) => {
    if (value instanceof ObjectId) {
      data[key] = value.toString();
    }
  });
  return data;
};

const getDocumentCreatorPipeline = () => {
  return [
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
        tempUser: {
          $arrayElemAt: ['$tempUser', 0]
        }
      }
    },
    {
      $addFields: {
        creator: {
          _id: '$tempUser._id',
          displayName: '$tempUser.displayName',
          email: '$tempUser.email'
        }
      }
    },
    {
      $project: {
        tempUser: 0
      }
    }
  ];
};

const getDocumentVersionsPipeline = (resource, filter) => {
  return [
    {
      $match: filter
    },
    {
      $addFields: {
        version: '$$ROOT'
      }
    },
    {
      $project: {
        version: 1,
        _id: 0
      }
    },
    {
      $lookup: {
        from: `${resource.revisionCollection.s.namespace.collection}`,
        let: {
          vCurrentId: '$version.currentId',
          vRevision: '$version.revision'
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ['$currentId', '$$vCurrentId']
                  },
                  {
                    $eq: ['$revision', '$$vRevision']
                  }
                ]
              }
            }
          }
        ],
        as: 'revision'
      }
    },
    {
      $unwind: {
        path: '$revision',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $lookup: {
        from: `${resource.currentCollection.s.namespace.collection}`,
        let: {
          vCurrentId: '$version.currentId',
          vRevision: '$version.revision'
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ['$_id', '$$vCurrentId']
                  },
                  {
                    $eq: ['$revision', '$$vRevision']
                  }
                ]
              }
            }
          }
        ],
        as: 'current'
      }
    },
    {
      $unwind: {
        path: '$current',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $addFields: {
        doc: {
          $ifNull: ['$current', '$revision']
        }
      }
    },
    {
      $project: {
        revision: 0,
        current: 0,
        'doc._id': 0,
        'doc.revision': 0
      }
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: ['$doc', '$$ROOT']
        }
      }
    },
    {
      $project: {
        doc: 0
      }
    },
    {
      $addFields: {
        currentId: '$version.currentId'
      }
    }
  ];
};

module.exports.getDocuments = async (
  resource,
  filter,
  user,
  query,
  sort,
  pagination
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
    pipeline.push(...getDocumentCreatorPipeline());
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

module.exports.createDocument = async (resource, data, user, groups) => {
  const doc = await builder.create({
    resource,
    data,
    user,
    groups,
    revision: 1
  });

  const insert = await resource.currentCollection.insertOne(doc);
  doc._id = insert.insertedId;
  return doc;
};

module.exports.updateDocument = async (resource, filter, data, user, etag) => {
  if (!data.revision)
    throw new createError.BadRequest('You must provide a revision');

  const originalDoc = await resource.currentCollection.findOne(filter);
  if (!originalDoc) throw new createError.NotFound('Document not found');

  if (parseInt(etag) !== originalDoc.revision)
    throw new createError.PreconditionFailed(
      'Precondition Failed: ETag revision mismatch'
    );

  if (data.revision !== originalDoc.revision)
    throw new createError.BadRequest(
      `The revision you provided is incorrect. Current revision: ${originalDoc.revision}`
    );

  const originalDocData = getDocumentDataOnly(originalDoc);
  const updatedData = getDocumentDataOnly(data);
  const docDiff = diff(originalDocData, updatedData);
  if (!docDiff.length) {
    return originalDoc;
  }

  const { _id, ...original } = originalDoc;
  // we validate & prepare the future current document
  const updatedDocument = await builder.replace({
    resource,
    data,
    user,
    originalDoc: original
  });

  const previousRevisionDoc = { currentId: originalDoc._id, ...original };
  const previousRevisionInsert = await resource.revisionCollection.insertOne(
    previousRevisionDoc
  );
  // at this point, if no error is thrown, that means that we can go on & replace the old current doc with the new one
  let failed;
  try {
    const replacedDocument = await resource.currentCollection.replaceOne(
      filter,
      updatedDocument
    );
    failed =
      replacedDocument.modifiedCount === 0 ? 'no document was replaced' : false;
  } catch (e) {
    failed = e.message;
  }
  if (failed) {
    // somehow the replacement has failed: we need to delete the previously inserted doc in revision collection, to revert back to the initial state
    await resource.revisionCollection.deleteOne({
      _id: previousRevisionInsert.insertedId
    });
    throw new Error(`Current document replacement failed: ${failed}`);
  }
  return { _id, ...updatedDocument };
};

module.exports.getDocument = async (resource, filter, query) => {
  let aggregate = query?.with?.includes('creator') || false;
  if (!aggregate) {
    return await resource.currentCollection.findOne(filter);
  }
  const pipeline = [{ $match: filter }, ...getDocumentCreatorPipeline()];
  const docs = await resource.currentCollection.aggregate(pipeline).toArray();
  return docs[0];
};

module.exports.getDocumentRevisions = async (resource, filter, query) => {
  return await resource.revisionCollection
    .find({ currentId: filter._id })
    .toArray();
};

module.exports.getDocumentRevision = async (
  resource,
  filter,
  query,
  revision,
  targetCollection = 'revision'
) => {
  const revisionId = createObjectId(revision);
  if (!revisionId && !Number.isInteger(parseInt(revision))) {
    throw new Error('The revision you provided is invalid');
  }
  const revFilter = {};
  if (targetCollection === 'revision') {
    revFilter.currentId = filter._id;
  }
  if (revisionId) {
    revFilter._id = revisionId;
  } else {
    revFilter.revision = parseInt(revision);
  }
  return await resource[`${targetCollection}Collection`].findOne(revFilter);
};

module.exports.getDocumentVersions = async (resource, filter, query) => {
  const verFilter = { currentId: filter._id };
  if (query.tag) {
    verFilter.tag = query.tag;
  }
  const versions = await resource.versionCollection
    .aggregate(getDocumentVersionsPipeline(resource, verFilter))
    .toArray();
  return !!query.tag ? versions[0] : versions;
};

module.exports.getDocumentVersion = async (
  resource,
  filter,
  query,
  version
) => {
  const versionId = createObjectId(version);
  const versionNumber = parseInt(version);
  if (!versionId && !Number.isInteger(versionNumber)) {
    throw new Error('The version you provided is invalid');
  }
  const verFilter = { currentId: filter._id };
  if (versionId) {
    verFilter._id = versionId;
  } else {
    verFilter.version = parseInt(version);
  }
  const doc = await resource.versionCollection
    .aggregate(getDocumentVersionsPipeline(resource, verFilter))
    .toArray();
  return doc[0];
};

module.exports.setDocumentVersion = async (
  resource,
  filter,
  query,
  revision,
  data,
  user
) => {
  // first we'll check if the requested revision is in current collection
  const currentDoc = await this.getDocumentRevision(
    resource,
    filter,
    query,
    revision,
    'current'
  );

  const revisionDoc = await this.getDocumentRevision(
    resource,
    filter,
    query,
    revision
  );
  if (!currentDoc && !revisionDoc)
    throw new createError.NotFound('Document not found');

  const doc = currentDoc ?? revisionDoc;
  doc.currentId = filter._id;

  const lastVersionDoc = await resource.versionCollection.findOne(
    { currentId: filter._id },
    { sort: { version: -1 } }
  );

  const version = {
    currentId: filter._id,
    version: (lastVersionDoc?.version ?? 0) + 1,
    name: data.name,
    tag: data.tag ?? `${(lastVersionDoc?.version ?? 0) + 1}.0.0`,
    revision: revision,
    publishedAt: new Date(),
    publishedBy: user?._id ?? null
  };
  try {
    const insertVersion = await resource.versionCollection.insertOne(version);
    return {
      _id: insertVersion.insertedId,
      ...version
    };
  } catch (e) {
    throw new createError.Conflict(
      `The revision you provided (${revision}) has already been set as version`
    );
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
          return reject(new createError.NotFound('Document not found'));
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

module.exports.deleteDocument = async (resource, filter, query) => {
  const doc = await this.getDocument(resource, filter, query);
  if (!doc) throw new createError.NotFound('Document not found');

  const result = await Promise.all([
    resource.versionCollection.deleteMany({ currentId: filter._id }),
    resource.revisionCollection.deleteMany({ currentId: filter._id }),
    resource.currentCollection.deleteOne({ _id: filter._id })
  ]);
  const prefixes = ['version', 'revision', 'current'];
  return result.map((val, i) => {
    return { [`${prefixes[i]}DeletedCount`]: val.deletedCount };
  });
};
