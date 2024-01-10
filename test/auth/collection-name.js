/* eslint-disable no-unused-expressions */
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.NODE_CONFIG_DIR = path.join(__dirname, 'config/');

// Require the dev-dependencies
const debug = require('debug')('campsi:test');

const config = require('config');
const chai = require('chai');
const CampsiServer = require('campsi');
const chaiHttp = require('chai-http');
const format = require('string-format');
const { getUsersCollectionName, getSessionCollectionName } = require('../../services/auth/lib/modules/collectionNames');
const AuthService = require('../../services/auth/lib');
const { emptyDatabase } = require('../helpers/emptyDatabase');
const expect = chai.expect;
format.extend(String.prototype);
chai.use(chaiHttp);
chai.should();

describe('Auth API', () => {
  const context = {};
  beforeEach(done => {
    emptyDatabase(config).then(() => {
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

  afterEach(done => {
    context.server.close(done);
  });

  /*
   * Test the /GET providers route
   */
  describe('Collection name tests', async () => {
    it('it should return the name of the custom users collection', done => {
      const usersCollectionName = context.campsi.services.get('auth').getUsersCollectionName();
      expect(usersCollectionName).equal('__custom_users__');
      done();
    });

    it('it should return the name of the custom session collection', done => {
      const sessionCollectionName = context.campsi.services.get('auth').getSessionCollectionName();
      expect(sessionCollectionName).equal('__custom_sessions__');
      done();
    });
  });
});
