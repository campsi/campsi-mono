/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const config = require('config');
const debug = require('debug')('campsi:test');
const setupBeforeEach = require('../helpers/setupBeforeEach');
chai.use(chaiHttp);
chai.should();

const services = {
  Notification: require('../../services/notifications')
};

describe('Notifications Service', () => {
  const context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => {
    context.server.close(done);
  });

  /**
   * Test the /GET route
   */
  describe('/GET', () => {
    it('should return the service description', done => {
      chai.request.get('/').end((err, res) => {
        if (err) debug(`received an error from chai: ${err.message}`);
        res.should.have.status(200);
        res.should.be.json;
        done();
      });
    });
  });
});
