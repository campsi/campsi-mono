const CampsiServer = require('../../');
const { MongoClient } = require('mongodb');
const mongoUriBuilder = require('mongo-uri-builder');
const debug = require('debug')('campsi:test');

module.exports = (config, services, context) => done => {
  const mongoUri = mongoUriBuilder(config.campsi.mongo);
  MongoClient.connect(mongoUri, (err, client) => {
    if (err) throw err;
    let db = client.db(config.campsi.mongo.database);
    db.dropDatabase(() => {
      client.close();
      context.campsi = new CampsiServer(config.campsi);
      Object.entries(services).map(([name, service]) => {
        context.campsi.mount(
          name.toLowerCase(),
          new service(config.services[name.toLowerCase()])
        );
      });

      context.campsi.on('campsi/ready', () => {
        context.server = context.campsi.listen(config.port);
        done();
      });
      context.campsi.start().catch(err => {
        debug('Error: %s', err);
      });
    });
  });
};
