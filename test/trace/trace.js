/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const fs = require('fs');

chai.should();
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);

const services = {
  Trace: require('../../services/trace/lib')
};

// Our parent block
describe('Trace', () => {
  beforeEach((done) => { // Before each test we empty the database
    campsi = new CampsiServer(config.campsi);
    campsi.mount('trace', new services.Trace(config.services.trace));
    campsi.on('campsi/ready', () => {
      server = campsi.listen(config.port);
      done();
    });
    campsi.start()
      .catch((err) => {
        debug('Error: %s', err);
      });
  });

  afterEach((done) => {
    server.close();
    done();
  });
  /*
     * Test the /GET trace route
     */
  describe('/GET trace', () => {
    it('it should return success', (done) => {
      chai.request(campsi.app)
        .get('/trace')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('object');
          done();
        });
    });
  });
  /*
     * Test the /GET trace route
     */
  describe('/POST docs', () => {
    it('it should return success', (done) => {
      chai.request(campsi.app)
        .post('/trace/foo/bar')
        .set('content-type', 'application/json')
        .send({testing: true, sender: 'mocha', deep: {description: 'more deeper object.'}})
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('object');
          done();
        });
    });
  });
  /*
     * Test the /GET trace route
     */
  describe('/POST docs', () => {
    it('it should return success', (done) => {
      chai.request(campsi.app)
        .post('/trace/file')
        .attach('file', fs.readFileSync('./rsrc/test.txt'), 'test.txt')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('object');
          done();
        });
    });
  });
});
