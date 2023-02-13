/* eslint-disable node/no-unpublished-require */
const config = require('config');
const debug = require('debug')('migrate');
const { MongoClient } = require('mongodb');
// CLI
const args = Array.from(process.argv).splice(2);
const options = { services: [], params: [] };
/* istanbul ignore if  */
if (!module.parent) {
  args.forEach(arg => options[arg.startsWith('--') ? 'params' : 'services'].push(arg));
  const collections = options.services.reduce((collections, service) => {
    const resourcesNames = Object.keys(config.services[service].options.resources);
    return collections.concat(resourcesNames.map(resourceName => `docs.${service}.${resourceName}`));
  }, []);
  const mongoUri = config.campsi.mongo.uri;
  MongoClient.connect(mongoUri).then(async client => {
    const db = client.db(config.campsi.mongo.database);
    await migrate(options.params, db, collections);
  });
}

async function migrate(params, db, collections, done) {
  for (const collection of collections) {
    debug('migrate collection', collection);
    await updateCollection(params, db, collection);
  }
  debug('migration complete');
}

async function updateCollection(params, db, collection) {
  const filter = { ownedBy: { $exists: true } };
  if (!params.includes('--all-docs')) {
    filter.users = { $exists: false };
  }
  try {
    const cursor = db.collection(collection).find(filter, { projection: { ownedBy: 1, _id: 1 } });

    try {
      let cursorHasNext = await cursor.hasNext();
      if (!cursorHasNext) {
        debug(collection, 'has no element');
      }
      while (cursorHasNext) {
        // update document
        try {
          const doc = await cursor.next();
          if (!doc === null) {
            debug('document is null');
            cursorHasNext = false;
          }
          const ops = {
            $set: {
              users: {
                [doc.ownedBy]: {
                  roles: ['owner'],
                  userId: doc.ownedBy
                }
              }
            }
          };
          if (params.includes('--remove-ownedBy')) {
            ops.$unset = { ownedBy: 1 };
          }

          const result = await db.collection(collection).updateOne({ _id: doc._id }, ops);
          debug(collection, doc._id, 'nModified', result.modifiedCount);
          cursorHasNext = await cursor.hasNext();
        } catch (err) {
          debug('error occured while fetching next() element', err);
          cursorHasNext = false;
        }
      }
    } catch (err) {
      debug('error occured while fetching hasNext() information', err);
    }
  } catch (err) {
    return debug(`an error occured during the find() from collection ${collection}`, err);
  }
}

module.exports = migrate;
