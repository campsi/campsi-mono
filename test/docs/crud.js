/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/docs/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const builder = require('../../services/docs/lib/modules/queryBuilder');
const { emptyDatabase } = require('../helpers/emptyDatabase');

chai.should();
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);

const services = {
  Docs: require('../../services/docs/lib')
};

// Helpers
async function createPizza(data, state) {
  const resource = campsi.services.get('docs').options.resources.pizzas;
  const doc = await builder.create({ user: null, data, resource, state });
  const result = await resource.collection.insertOne(doc);
  return result.insertedId;
}

// Our parent block
describe('CRUD', () => {
  beforeEach(done => {
    emptyDatabase(config).then(() => {
      campsi = new CampsiServer(config.campsi);

      campsi.mount('docs', new services.Docs(config.services.docs));

      campsi.on('campsi/ready', () => {
        server = campsi.listen(config.port);
        done();
      });
      campsi.start().catch(err => {
        debug('Error: %s', err);
      });
    });
  });

  afterEach(done => {
    server.close();
    done();
  });
  /*
   * Test the /GET docs route
   */
  describe('/GET docs', () => {
    it('it should GET all the ressources', done => {
      chai
        .request(campsi.app)
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
  describe('/POST docs/pizzas/:getDocuments', () => {
    it('it should GET all the documents', done => {
      chai
        .request(campsi.app)
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
   * Test the /GET docs/pizzas route
   */
  describe('/GET docs/pizzas', () => {
    it('it should GET all the documents', done => {
      chai
        .request(campsi.app)
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
    it('it should not create a document (no credentials for default state)', done => {
      const data = { name: 'test' };
      chai
        .request(campsi.app)
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
    it('it should return a 404 error', done => {
      const data = { name: 'test' };
      createPizza(data, 'working_draft')
        .then(id => {
          chai
            .request(campsi.app)
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
        .catch(err => {
          throw err;
        });
    });
  });
});
