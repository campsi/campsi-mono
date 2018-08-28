/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

const chai = require('chai');
const initialize = require('./utils/initialization');
const debug = require('debug')('campsi:test');
const config = require('config');
const builder = require('../lib/modules/queryBuilder');

let {
  campsi,
  beforeEachCallback,
  afterCallback
} = initialize(config, {docs: require('../lib/index')});

// Helpers
function createPizza (data, state) {
  return new Promise(function (resolve, reject) {
    let resource = campsi.services.get('docs').options.resources['pizzas'];
    builder.create({
      user: null,
      data: data,
      resource: resource,
      state: state
    }).then((doc) => {
      resource.collection.insertOne(doc, (err, result) => {
        if (err) return reject(err);
        resolve(result.ops[0]._id);
      });
    }).catch((error) => {
      reject(error);
    });
  });
}

describe('CRUD', () => {
  beforeEach(beforeEachCallback);
  after(afterCallback);
  /*
   * Test the /GET docs route
   */
  describe('/GET docs', () => {
    it('it should GET all the ressources', (done) => {
      chai.request(campsi.app)
        .get('/docs')
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
   * Test the /GET docs/pizzas route
   */
  describe('/GET docs/pizzas', () => {
    it('it should GET all the documents', (done) => {
      chai.request(campsi.app)
        .get('/docs/pizzas')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.have.header('x-total-count', '0');
          res.should.not.have.header('link');
          res.should.be.json;
          res.body.should.be.a('array');
          res.body.length.should.be.eq(0);
          done();
        });
    });
  });
  /*
   * Test the /POST docs/pizzas route
   */
  describe('/POST docs/pizzas', () => {
    it('it should not create a document (no credentials for default state)', (done) => {
      let data = {'name': 'test'};
      chai.request(campsi.app)
        .post('/docs/pizzas')
        .set('content-type', 'application/json')
        .send(data)
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(401);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.have.property('message');
          done();
        });
    });
  });
  /*
   * Test the /GET docs/pizzas/:id route
   */
  describe('/GET docs/pizzas/:id', () => {
    it('it should return a 404 error', (done) => {
      let data = {'name': 'test'};
      createPizza(data, 'working_draft')
        .then((id) => {
          chai.request(campsi.app)
            .get('/docs/pizzas/{0}'.format(id))
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.should.have.status(404);
              res.should.be.json;
              res.body.should.be.a('object');
              res.body.should.have.property('message');
              done();
            });
        })
        .catch((err) => {
          throw err;
        });
    });
  });
});
