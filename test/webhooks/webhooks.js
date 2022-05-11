process.env.NODE_CONFIG_DIR = './config';
process.env.NODE_ENV = 'test';

const { MongoClient } = require('mongodb');
const mongoUriBuilder = require('mongo-uri-builder');
const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const CampsiServer = require('campsi');
const config = require('config');
const setupBeforeEach = require('./setupBeforeEach');
let campsi;

chai.use(chaiHttp);
chai.should();

const services = {
  Trace: require('campsi-service-trace'),
  Webhooks: require('../../services/webhooks/lib')
};

describe('Assets API', () => {
  let context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => context.server.close(done));

  describe('Basic webhook', () => {
    it('it should list webhooks', done => {
      chai.request(context.campsi.app)
        .get('/webhooks')
        .end((err, res) => {
          debug(err, res);
          done();
        });
    });
    it('it should create a webhook', done => {
      chai.request(context.campsi.app)
        .post('/webhooks')
        .set('content-type', 'application/json')
        .send({
          event: 'webhooks/test/topic',
          uri: `http://localhost:${config.port || 3000}/trace`,
          method: 'post'
        })
        .end((err, res) => {
          debug('request ',err, res);
          done();
        });
    });
    it('it should call a trace event when emiting a hooked event.', (done) => {
      campsi.on('trace/request', (payload) => {
        payload.should.be.a('object');
        payload.method.should.be.eq('GET');
        done();
      });
      campsi.emit('webhooks/test/topic');
    });
  });
});
