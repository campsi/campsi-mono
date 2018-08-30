const config = require('config');
const async = require('async');
const debug = require('debug')('migrate');
const mongoUriBuilder = require('mongo-uri-builder');
const {MongoClient} = require('mongodb');

const args = Array.from(process.argv).splice(2);
const options = {services: [], params: []};
args.forEach(arg => options[arg.startsWith('--') ? 'params' : 'services'].push(arg));
const collections = options.services.reduce((collections, service) => {
  const resourcesNames = Object.keys(config.services[service].options.resources);
  return collections.concat(resourcesNames.map(resourceName => `docs.${service}.${resourceName}`));
}, []);

const mongoUri = mongoUriBuilder(config.campsi.mongo);
MongoClient.connect(mongoUri, (err, client) => {
  if (err) throw err;
  const db = client.db(config.campsi.mongo.database);
  async.forEachSeries(collections, (collection, cb) => {
    debug('migrate collection', collection);
    updateCollection(db, collection, cb);
  }, () => {
    debug('complete');
  });
});

function updateCollection (db, collection, done) {
  db.collection(collection).find(
    {ownedBy: {$exists: true}, users: {$exists: false}},
    {$project: {ownedBy: 1, _id: 1}},
    (err, cursor) => {
      if (err) return debug(`an error occured during the find() from collection ${collection}`, err);
      let cursorHasNext = true;
      const updateDocument = (doc, cb) => {
        if (doc === null) {
          debug('document is null');
          return cb();
        }
        db.collection(collection).updateOne(
          {_id: doc._id},
          {
            $set: {
              users: {
                [doc.ownedBy]: {
                  roles: ['owner'],
                  userId: doc.ownedBy
                }
              }
            }
          },
          (err, result) => {
            if (err) {
              debug('an error occured during the update', err);
            } else {
              debug(collection, doc._id, 'nModified', result.nModified);
            }
            cursor.hasNext((err, hasNext) => {
              if (err) {
                debug('error occured while fetching hasNext() information', err);
              }
              cursorHasNext = hasNext;
              cb();
            });
          }
        );
      };
      cursor.hasNext((err, hasNext) => {
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
            if (err) {
              debug('error occured while fetching next() element', err);
              cursorHasNext = false;
              return cb();
            }
            updateDocument(doc, cb);
          });
        }, done);
      });
    }
  );
}
