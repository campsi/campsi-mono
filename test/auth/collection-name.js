/* eslint-disable no-unused-expressions */
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.NODE_CONFIG_DIR = path.join(__dirname, 'config/');

// Require the dev-dependencies
const debug = require('debug')('campsi:test');
const { MongoClient } = require('mongodb');

const config = require('config');
const chai = require('chai');
const CampsiServer = require('campsi');
const mongoUriBuilder = require('mongo-uri-builder');
const chaiHttp = require('chai-http');
const format = require('string-format');
const { getUsersCollectionName, getSessionCollectionName } = require('../../services/auth/lib/modules/collectionNames');
const AuthService = require('../../services/auth/lib');
const expect = chai.expect;
format.extend(String.prototype);
chai.use(chaiHttp);
chai.should();

describe('Auth API', () => {
  const context = {};
  beforeEach(done => {
    const mongoUri = mongoUriBuilder(config.campsi.mongo);
    MongoClient.connect(mongoUri, (err, client) => {
      if (err) throw err;
      const db = client.db(config.campsi.mongo.database);
      db.dropDatabase(() => {
        client.close();
        context.campsi = new CampsiServer(config.campsi);
        context.campsi.mount('auth', new AuthService(config.services.auth));

        context.campsi.on('campsi/ready', () => {
          context.server = context.campsi.listen(config.port);
          done();
        });
        context.campsi.start().catch(err => {
          debug('Error: %s', err);
        });
      });
    });
  });

  afterEach(done => {
    context.server.close(done);
  });

  /*
   * Test the /GET providers route
   */
  describe('Collection name tests', async () => {
    it('it should return the name of the custom users collection', done => {
      const usersCollectionName = getUsersCollectionName();
      expect(usersCollectionName).equal('__custom_users__');
      done();
    });

    it('it should return the name of the custom session collection', done => {
      const sessionCollectionName = getSessionCollectionName();
      expect(sessionCollectionName).equal('__custom_sessions__');
      done();
    });
  });
});
