/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/docs/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const { MongoClient } = require('mongodb');
const mongoUriBuilder = require('mongo-uri-builder');
const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const builder = require('../../services/docs/lib/modules/queryBuilder');
const fakeId = require('fake-object-id');

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

function buildPizzaDoc(data, resource, state) {
  return new Promise(function(resolve, reject) {
    builder
      .create({
        user: owner,
        data,
        resource,
        state
      })
      .then(doc => {
        resource.collection.insertOne(doc, (err, result) => {
          if (err) return reject(err);
          resolve(result.insertedId);
        });
      })
      .catch(error => {
        reject(error);
      });
  });
}

// Helpers
function createPizzas() {
  return new Promise(function(resolve, reject) {
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
  before(done => {
    // Empty the database
    const mongoUri = mongoUriBuilder(config.campsi.mongo);
    MongoClient.connect(mongoUri, (err, client) => {
      if (err) throw err;
      const db = client.db(config.campsi.mongo.database);
      db.dropDatabase(() => {
        client.close();
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
   describe('Test sort', () => {
    it('it should GET all the pizzas sorted by name in reverse order', async() => {
      const res = await chai.request(campsi.app).get('/docs/pizzas/?sort=-data.name');
    
      const pizzas = res?.body;

      res.should.have.status(200);
      pizzas.should.be.a('array');
      pizzas.length.should.be.eq(100);

      // check last 5 entries are in the correct order
      pizzas[99]?.data?.name.should.be.eq('margherita_0');
      pizzas[98]?.data?.name.should.be.eq('margherita_1');
      pizzas[97]?.data?.name.should.be.eq('margherita_10');
      pizzas[96]?.data?.name.should.be.eq('margherita_11');
      pizzas[95]?.data?.name.should.be.eq('margherita_12');

      // check first 5 entries are in the correct order
      pizzas[4]?.data?.name.should.be.eq('margherita_95');
      pizzas[3]?.data?.name.should.be.eq('margherita_96');
      pizzas[2]?.data?.name.should.be.eq('margherita_97');
      pizzas[1]?.data?.name.should.be.eq('margherita_98');
      pizzas[0]?.data?.name.should.be.eq('margherita_99');
    });

    it('it should GET all the pizzas sorted by name in alphabetical order', async () => {
        const res = await chai.request(campsi.app).get('/docs/pizzas/?sort=data.name');
    
        const pizzas = res?.body;

        res.should.have.status(200);
        pizzas.should.be.a('array');
        pizzas.length.should.be.eq(100);

        // check first 5 entries are in the correct order
        pizzas[0]?.data?.name.should.be.eq('margherita_0');
        pizzas[1]?.data?.name.should.be.eq('margherita_1');
        pizzas[2]?.data?.name.should.be.eq('margherita_10');
        pizzas[3]?.data?.name.should.be.eq('margherita_11');
        pizzas[4]?.data?.name.should.be.eq('margherita_12');

        // check last 5 entries are in the correct order
        pizzas[95]?.data?.name.should.be.eq('margherita_95');
        pizzas[96]?.data?.name.should.be.eq('margherita_96');
        pizzas[97]?.data?.name.should.be.eq('margherita_97');
        pizzas[98]?.data?.name.should.be.eq('margherita_98');
        pizzas[99]?.data?.name.should.be.eq('margherita_99');
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
