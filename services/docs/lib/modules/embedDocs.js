const async = require('async');
const ObjectId = require('mongodb').ObjectId;
const findRefs = require('campsi-find-references');

function fetchSubdoc (resource, reference, user, hash) {
  const _id = reference.get();
  return new Promise((resolve, reject) => {
    if (typeof hash[_id] !== 'undefined') {
      reference.set(hash[_id]);
      return resolve();
    }

    resource.collection.findOne(
      {_id: new ObjectId(_id)},
      {_id: 1, states: 1},
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
function embedDocs (resource, embed, user, doc, hash) {
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
          resource.schema.resources[relationship.resource],
          reference,
          user,
          hash
        ).then(refCb);
      }, cb);
    }, () => (error) ? reject(error) : resolve());
  });
}
module.exports.one = embedDocs;
module.exports.many = function (resource, embed, user, docs) {
  let hash = {};
  return new Promise((resolve) => {
    async.forEach(docs, (doc, cb) => {
      embedDocs(resource, embed, user, doc.data, hash).then(cb);
    }, resolve);
  });
};
