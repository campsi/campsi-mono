const async = require('async');
const ObjectId = require('mongodb').ObjectId;
const findRefs = require('campsi-find-references');
const builder = require('./queryBuilder');

function fetchSubdoc (resource, reference, user, hash) {
  const _id = reference.get();
  return new Promise((resolve, reject) => {
    if (typeof hash[_id] !== 'undefined') {
      reference.set(hash[_id]);
      return resolve();
    }

    resource.collection.findOne(
      {_id: new ObjectId(_id)},
      builder.select({resource: resource, user: user}),
      (err, subDoc) => {
        if (err) return reject(err);
        hash[_id] = subDoc.states[resource.defaultState].data;
        reference.set(hash[_id]);
        return resolve();
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
 * @returns {Promise}
 */
function embedDocs (resource, schema, embed, user, doc, hash) {
  hash = hash || {};
  return new Promise((resolve, reject) => {
    let error;
    async.eachOf(resource.rels || {}, (relationship, name, cb) => {
      const embedRel = (relationship.embed || (embed && embed.includes(name)));
      if (!embedRel) {
        return async.setImmediate(cb);
      }

      const references = findRefs(doc, relationship.path.split('.'));
      async.each(references, (reference, refCb) => {
        fetchSubdoc(
          schema.resources[relationship.resource],
          reference,
          user,
          hash
        ).then(refCb);
      }, cb);
    }, () => (error) ? reject(error) : resolve());
  });
}
module.exports.one = embedDocs;
module.exports.many = function (resource, schema, embed, user, docs) {
  let hash = {};
  return new Promise((resolve) => {
    async.forEach(docs, (doc, cb) => {
      embedDocs(resource, schema, embed, user, doc.data, hash).then(cb);
    }, resolve);
  });
};
