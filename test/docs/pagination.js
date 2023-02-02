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
const fakeId = require('fake-object-id');
const { emptyDatabase } = require('../helpers/emptyDatabase');

chai.should();
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);

const owner = {
  _id: fakeId()
};

const services = {
  Docs: require('../../services/docs/lib')
};

async function buildPizzaDoc(data, resource, state) {
  const doc = await builder.create({ user: owner, data, resource, state });
  const result = await resource.collection.insertOne(doc);
  return result.insertedId;
}

// Helpers
function createPizzas() {
  return new Promise(function (resolve, reject) {
    const resource = campsi.services.get('docs').options.resources.pizzas;
    const pizzas = [];
    const promises = [];

    for (let i = 0; i < 100; i++) {
      pizzas.push({ data: { name: `margherita_${i}` }, resource, state: 'published' });
    }

    pizzas.forEach(item => {
      promises.push(buildPizzaDoc(item.data, item.resource, item.state));
    });

    Promise.all(promises).then(() => {
      resolve();
    });
  });
}

// Our parent block
describe('Pagination', () => {
  before(async done => {
    await emptyDatabase(config);

    campsi = new CampsiServer(config.campsi);
    campsi.mount('docs', new services.Docs(config.services.docs));

    campsi.on('campsi/ready', () => {
      server = campsi.listen(config.port);

      createPizzas().then(() => done());
    });

    campsi.start().catch(err => {
      debug('Error: %s', err);
    });
  });

  after(done => {
    server.close();
    done();
  });

  /*
   * Test the /GET docs/pizzas route
   */
  describe('/GET docs/docs/pizzas', () => {
    it('it should GET all the pizzas with no pagination', done => {
      chai
        .request(campsi.app)
        .get('/docs/pizzas/?sort-name=name')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.have.header('x-total-count', '100');
          res.should.not.have.header('link');
          res.should.be.json;
          res.body.should.be.a('array');
          res.body.length.should.be.eq(100);
          done();
        });
    });
  });

  /*
   * Test the /GET docs/pizzas route
   */
  describe('/GET docs/docs/pizzas', () => {
    it('it should GET the first 50 pizzas', done => {
      chai
        .request(campsi.app)
        .get('/docs/pizzas/?page=1&perPage=50')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.have.header('x-total-count', '100');
          res.should.have.header('x-page', '1');
          res.should.have.header('x-last-page', '2');
          res.should.have.header('x-per-page', '50');
          res.should.have.header('link');
          res.should.be.json;
          res.body.should.be.a('array');
          res.body.length.should.be.eq(50);
          done();
        });
    });
  });

  /*
   * Test the /GET docs/pizzas route
   */
  describe('/GET docs/docs/pizzas', () => {
    it('it should GET the last 50 pizzas', done => {
      chai
        .request(campsi.app)
        .get('/docs/pizzas/?page=2&perPage=50')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.have.header('x-total-count', '100');
          res.should.have.header('x-page', '2');
          res.should.have.header('x-last-page', '2');
          res.should.have.header('x-per-page', '50');
          res.should.have.header('link');
          res.should.be.json;
          res.body.should.be.a('array');
          res.body.length.should.be.eq(50);
          done();
        });
    });
  });

  /*
   * Test the /GET docs/pizzas route
   */
  describe('/GET docs/docs/pizzas', () => {
    it('it should return zero documents, we are out of bounds', done => {
      chai
        .request(campsi.app)
        .get('/docs/pizzas/?page=3&perPage=50')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.have.header('x-total-count', '100');
          res.should.have.header('x-page', '2');
          res.should.have.header('x-last-page', '2');
          res.should.have.header('x-per-page', '50');
          res.should.have.header('link');
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
  describe('/GET docs/docs/pizzas', () => {
    it('it should return zero documents, we are out of bounds', done => {
      chai
        .request(campsi.app)
        .get('/docs/pizzas/?page=0&perPage=50')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(404);
          res.should.not.have.header('x-total-count');
          res.should.not.have.header('x-page', '2');
          res.should.not.have.header('x-last-page', '2');
          res.should.not.have.header('x-per-page', '50');
          res.should.not.have.header('link');
          res.should.be.json;
          done();
        });
    });
  });

  /*
   * Test the /GET docs/pizzas route
   */
  describe('/GET docs/docs/pizzas', () => {
    it('it should return zero documents, we are out of bounds', done => {
      chai
        .request(campsi.app)
        .get('/docs/pizzas/?page=500&perPage=50')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.have.header('x-total-count');
          res.should.have.header('x-page', '2');
          res.should.have.header('x-last-page', '2');
          res.should.have.header('x-per-page', '50');
          res.body.length.should.be.eq(0);
          res.should.have.header('link');
          res.should.be.json;
          done();
        });
    });
  });

  /*
   * Test the /GET docs/pizzas route
   */
  describe('/GET docs/docs/pizzas', () => {
    it('it should return 19 documents from page 5 out of 6', done => {
      chai
        .request(campsi.app)
        .get('/docs/pizzas/?page=5&perPage=19')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.have.header('x-total-count');
          res.should.have.header('x-page', '5');
          res.should.have.header('x-last-page', '6');
          res.should.have.header('x-per-page', '19');
          res.body.length.should.be.eq(19);
          res.should.have.header('link');
          res.should.be.json;
          done();
        });
    });
  });

  /*
   * Test the /GET docs/pizzas route
   */
  describe('/GET docs/docs/pizzas', () => {
    it('it should return 5 documents from the end of the list', done => {
      chai
        .request(campsi.app)
        .get('/docs/pizzas/?page=6&perPage=19')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.have.header('x-total-count');
          res.should.have.header('x-page', '6');
          res.should.have.header('x-last-page', '6');
          res.should.have.header('x-per-page', '19');
          res.body.length.should.be.eq(5);
          res.should.have.header('link');
          res.should.be.json;
          done();
        });
    });
  });
});
