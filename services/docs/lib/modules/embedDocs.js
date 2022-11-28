/* eslint-disable node/no-unpublished-require */
const async = require("async");
const ObjectId = require("mongodb").ObjectId;
const findReferences = require("../../../../lib/modules/findReferences");
const createObjectId = require("campsi/lib/modules/createObjectId");

/**
 *
 * @param resource
 * @param reference
 * @returns {Promise<unknown>}
 */
function fetchDocument(resource, reference) {
  return new Promise((resolve, reject) => {
    resource.collection.findOne(
      { _id: new ObjectId(reference) },
      { _id: 1, states: 1 },
      (err, document) => {
        if (err) return reject(err);
        return resolve(document?.states[resource.defaultState].data);
      }
    );
  });
}

/**
 *
 * @param resource
 * @param reference
 * @param fields
 * @returns {Promise<{}>}
 */
function getSubDocument(resource, reference, fields) {
  return fetchDocument(resource, reference).then((document) => {
    const subDocument = { _id: new ObjectId(reference) };
    fields.forEach((field) => {
      subDocument[field] = document?.[field];
    });
    return subDocument;
  });
}

/**
 *
 * @param {Resource} resource
 * @param {Array} embed
 * @param {User} user
 * @param {Object} doc
 * @param {Resource|[]} resources
 * @returns {Promise}
 */
function embedDocs(resource, embed, user, doc, resources) {
  return new Promise((resolve, reject) => {
    async.eachOf(
      resource.rels || {},
      (relationship, name, relationCb) => {
        const embedRelation =
          relationship.embed || (embed && embed.includes(name));
        if (!embedRelation) {
          return async.setImmediate(relationCb);
        }

        const references = findReferences(doc, relationship.path);
        if (Array.isArray(references)) {
          doc[name] = [];
          async.eachOf(
            references,
            (reference, index, referenceCb) => {
              getSubDocument(
                resources[relationship.resource],
                reference,
                relationship.fields || []
              ).then((subDocument) => {
                doc[name][index] = subDocument;
                referenceCb();
              });
            },
            (error) => {
              relationCb(error);
            }
          );
        } else if (createObjectId(references)) {
          getSubDocument(
            resources[relationship.resource],
            references,
            relationship.fields
          ).then((subDocument) => {
            doc[name] = subDocument;
            relationCb();
          });
        } else {
          async.setImmediate(relationCb);
        }
      },
      () => resolve(doc)
    );
  });
}

module.exports.one = embedDocs;
module.exports.many = function (resource, embed, user, docs, resources) {
  return new Promise((resolve) => {
    async.forEach(
      docs,
      (doc, cb) => {
        embedDocs(resource, embed, user, doc.data, resources).then((doc) => {
          cb();
          return doc;
        });
      },
      resolve
    );
  });
};
