process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const config = require('config');
const setupBeforeEach = require('../helpers/setupBeforeEach');

chai.use(chaiHttp);
chai.should();

const services = {
  Webhooks: require('../../services/webhooks/lib')
};

describe('Webhooks', () => {
  const context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => context.server.close(done));

  describe('Basic webhook', () => {
    it('it should list webhooks', done => {
      chai
        .request(context.campsi.app)
        .get('/webhooks')
        .end((err, res) => {
          debug(err, res);
          done();
        });
    });
    it('it should create a webhook', done => {
      const campsi = context.campsi;

      campsi.on('trace/request', payload => {
        payload.should.be.a('object');
        payload.method.should.be.eq('GET');
        done();
      });

      chai
        .request(context.campsi.app)
        .post('/webhooks')
        .set('content-type', 'application/json')
        .send({
          event: 'webhooks/test/topic',
          uri: `http://localhost:${config.port || 3000}/trace`,
          method: 'post'
        })
        .end((err, res) => {
          debug('request ', err, res);
          done();
        });
    });
  });
});
