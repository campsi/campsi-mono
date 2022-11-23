/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const config = require('config');
const debug = require('debug')('campsi:audit');
const setupBeforeEach = require('../helpers/setupBeforeEach');
chai.use(chaiHttp);
chai.should();

const services = {
  Audit: require('../../services/audit')
};

describe('Audt Service', () => {
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
      chai
        .request(context.campsi.app)
        .get('/')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.services.notifications.should.be.a('object');
          res.body.services.notifications.title.should.be.eq('NotifiAuditcations');
          res.body.services.notifications.class.should.be.eq('AuditService');

          done();
        });
    });
  });
});
