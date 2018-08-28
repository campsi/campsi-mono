const {MongoClient} = require('mongodb');
const mongoUriBuilder = require('mongo-uri-builder');
const CampsiServer = require('campsi');
const debug = require('debug')('campsi-test');
const format = require('string-format');
const chai = require('chai');
const chaiHttp = require('chai-http');
let should = chai.should();
format.extend(String.prototype);
chai.use(chaiHttp);

module.exports = function initialize (config, services) {
  let campsi = new CampsiServer(config.campsi);
  return {
    campsi: campsi,
    afterEachCallback: (done) => {
      campsi.server.close();
      done();
    },
    beforeEachCallback: (done) => {
      // Empty the database
      const mongoUri = mongoUriBuilder(config.campsi.mongo);
      MongoClient.connect(mongoUri, (err, client) => {
        if (err) throw err;
        let db = client.db(config.campsi.mongo.database);
        db.dropDatabase(() => {
          client.close();
          Object.keys(services).forEach(service => {
            campsi.mount(service, new services[service](config.services[service]));
          });
          campsi.on('campsi/ready', () => {
            campsi.server = campsi.listen(config.port);
            done();
          });

          campsi.start().catch((err) => {
            debug('Error: %s', err);
          });
        });
      });
    }
  };
};
