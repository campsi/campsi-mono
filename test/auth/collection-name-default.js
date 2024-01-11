/* eslint-disable no-unused-expressions */
process.env.NODE_ENV = 'test';
process.env.NODE_CONFIG_DIR = './test/config';

// Require the dev-dependencies
const debug = require('debug')('campsi:test');
const config = require('config');
const chai = require('chai');
const CampsiServer = require('campsi');
const chaiHttp = require('chai-http');
const format = require('string-format');
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
    it('it should return the default name of the users collection', done => {
      const usersCollectionName = context.campsi.services.get('auth').getUsersCollectionName();
      expect(usersCollectionName).equal('__users__');
      done();
    });

    it('it should return the default name of the session collection', done => {
      const sessionCollectionName = context.campsi.services.get('auth').getSessionCollectionName();
      expect(sessionCollectionName).equal('__sessions__');
      done();
    });
  });
});
