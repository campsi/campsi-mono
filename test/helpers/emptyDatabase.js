const mongoUriBuilder = require('mongo-uri-builder');
const { MongoClient } = require('mongodb');

module.exports.emptyDatabase = async config => {
  const mongoUri = mongoUriBuilder(config.campsi.mongo);
  const client = await MongoClient.connect(mongoUri);
  const db = client.db(config.campsi.mongo.database);
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  for (const collection of collections) {
    await db.collection(collection.name).deleteMany({});
    await db.collection(collection.name).dropIndexes();
  }
  await client.close();
};
