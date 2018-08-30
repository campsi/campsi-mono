const config = require('config');
const async = require('async');
const debug = require('debug')('migrate');
const mongoUriBuilder = require('mongo-uri-builder');
const {MongoClient} = require('mongodb');
// CLI
const args = Array.from(process.argv).splice(2);
const options = {services: [], params: []};
if (!module.parent) {
  args.forEach(arg => options[arg.startsWith('--') ? 'params' : 'services'].push(arg));
  const collections = options.services.reduce((collections, service) => {
    const resourcesNames = Object.keys(config.services[service].options.resources);
    return collections.concat(resourcesNames.map(resourceName => `docs.${service}.${resourceName}`));
  }, []);
  const mongoUri = mongoUriBuilder(config.campsi.mongo);
  MongoClient.connect(mongoUri, (err, client) => {
    if (err) throw err;
    const db = client.db(config.campsi.mongo.database);
    migrate(options.params, db, collections);
  });
}

function migrate (params, db, collections, done) {
  async.forEachSeries(collections, (collection, cb) => {
    debug('migrate collection', collection);
    updateCollection(params, db, collection, cb);
  }, () => {
    debug('migration complete');
    if (typeof done === 'function') {
      done();
    }
  });
}

function updateCollection (params, db, collection, done) {
  const filter = {ownedBy: {$exists: true}};
  if (!params.includes('--all-docs')) {
    filter.users = {$exists: false};
  }
  db.collection(collection).find(filter, {$project: {ownedBy: 1, _id: 1}}, (err, cursor) => {
    /* istanbul ignore if  */
    if (err) return debug(`an error occured during the find() from collection ${collection}`, err);
    let cursorHasNext = true;
    const updateDocument = (doc, cb) => {
      if (doc === null) {
        debug('document is null');
        return cb();
      }
      const ops = {$set: {users: {[doc.ownedBy]: {roles: ['owner'], userId: doc.ownedBy}}}};
      if (params.includes('--remove-ownedBy')) {
        ops.$unset = {ownedBy: 1};
      }
      db.collection(collection).updateOne({_id: doc._id}, ops, (err, result) => {
        (err) ? debug('an error occured during the update', err)
          : debug(collection, doc._id, 'nModified', result.nModified);
        cursor.hasNext((err, hasNext) => {
          /* istanbul ignore if  */
          if (err) debug('error occured while fetching hasNext() information', err);
          cursorHasNext = hasNext;
          cb();
        });
      });
    };
    cursor.hasNext((err, hasNext) => {
      /* istanbul ignore if  */
      if (err) {
        debug('error occured while fetching hasNext() information', err);
        return done();
      }
      cursorHasNext = hasNext;
      if (!cursorHasNext) {
        debug(collection, 'has no element');
      }
      async.whilst(() => cursorHasNext, (cb) => {
        cursor.next((err, doc) => {
          /* istanbul ignore if  */
          if (err) {
            debug('error occured while fetching next() element', err);
            cursorHasNext = false;
            return cb();
          }
          updateDocument(doc, cb);
        });
      }, done);
    });
  });
}

module.exports = migrate;
