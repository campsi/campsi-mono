const mongoUriBuilder = require('mongo-uri-builder');
const { MongoClient } = require('mongodb');

module.exports.emptyDatabase = async config => {
  const mongoUri = mongoUriBuilder(config.campsi.mongo);
  const client = await MongoClient.connect(mongoUri);
  const db = client.db(config.campsi.mongo.database);
  await db.dropDatabase();
  await client.close();
};
