const async = require('async');
const ObjectId = require('mongodb').ObjectId;
const findRefs = require('campsi-find-references');

function fetchSubdoc(resource, reference, user) {
  const _id = reference.get();
  return new Promise((resolve, reject) => {
    resource.collection.findOne(
      { _id: new ObjectId(_id) },
      { _id: 1, states: 1 },
      (err, subDoc) => {
        if (err) return reject(err);
        return resolve(subDoc.states[resource.defaultState].data);
      }
    );
  });
}
/**
 *
 * @param {Resource} resource
 * @param {Schema} schema
 * @param {Array} embed
 * @param {User} user
 * @param {Object} doc
 * @param {Object} [hash]
 * @param {Resource|]} resources
 * @returns {Promise}
 */
function embedDocs(resource, embed, user, doc, resources) {
  return new Promise((resolve, reject) => {
    let error;
    async.eachOf(
      resource.rels || {},
      (relationship, name, cb) => {
        const embedRel = relationship.embed || (embed && embed.includes(name));
        if (!embedRel) {
          return async.setImmediate(cb);
        }

        const references = findRefs(doc, relationship.path.split('.'));
        async.each(
          references,
          (reference, refCb) => {
            fetchSubdoc(resources[relationship.resource], reference, user).then(
              subdoc => {
                doc[embed] = {};
                relationship.fields.forEach(field => {
                  doc[embed][field] = subdoc[field];
                });
                refCb();
              }
            );
          },
          cb
        );
      },
      () => (error ? reject(error) : resolve(doc))
    );
  });
}
module.exports.one = embedDocs;
module.exports.many = function(resource, embed, user, docs, resources) {
  return new Promise(resolve => {
    async.forEach(
      docs,
      (doc, cb) => {
        embedDocs(resource, embed, user, doc.data, resources).then(doc => {
          cb();
          return doc;
        });
      },
      resolve
    );
  });
};
