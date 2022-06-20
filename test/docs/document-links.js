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

let firstPizza;
let secondPizza;
let thirdPizza;
let fourthPizza;
let fifthPizza;

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

    for (let i = 0; i < 5; i++) {
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

function getPizzaWithLinks(id) {
  return new Promise(resolve => {
    chai
      .request(campsi.app)
      .get(`/docs/pizzas/${id}?withLinks=true`)
      .end((err, res) => {
        if (err) debug(`received an error from chai: ${err.message}`);
        resolve(res.body);
      });
  });
}

function getPizzaWithoutLinks(id) {
  return new Promise(resolve => {
    chai
      .request(campsi.app)
      .get(`/docs/pizzas/${id}`)
      .end((err, res) => {
        if (err) debug(`received an error from chai: ${err.message}`);
        resolve(res.body);
      });
  });
}

// Our parent block
describe('Document links', () => {
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
    it('it should get all the pizzas', done => {
      chai
        .request(campsi.app)
        .get('/docs/pizzas/')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.not.have.header('link');
          res.should.be.json;
          res.body.should.be.a('array');
          firstPizza = res.body[0].id;
          secondPizza = res.body[1].id;
          thirdPizza = res.body[2].id;
          fourthPizza = res.body[3].id;
          fifthPizza = res.body[4].id;

          done();
        });
    });
  });

  /*
   * Test the /GET docs/pizzas route
   */
  describe('/GET first from the collection should have no previous link but should have next link', () => {
    it('it should get a document with a link to the next one and the previous one', done => {
      getPizzaWithLinks(firstPizza).then(body => {
        body.next_id.should.eq(secondPizza);
        body.should.not.have.property('previous_id');
        getPizzaWithLinks(secondPizza).then(body => {
          body.previous_id.should.eq(firstPizza);
          body.next_id.should.eq(thirdPizza);
          getPizzaWithLinks(thirdPizza).then(body => {
            body.previous_id.should.eq(secondPizza);
            body.next_id.should.eq(fourthPizza);
            getPizzaWithLinks(fourthPizza).then(body => {
              body.previous_id.should.eq(thirdPizza);
              body.next_id.should.eq(fifthPizza);
              getPizzaWithLinks(fifthPizza).then(body => {
                body.should.not.have.property('next_id');
                body.previous_id.should.eq(fourthPizza);
                done();
              });
            });
          });
        });
      });
    });
  });

  /*
   * Test the /GET docs/pizzas route
   */
  describe('GET WITHOUT LINKS', () => {
    it('it should get a document with no links', done => {
      getPizzaWithoutLinks(firstPizza).then(body => {
        getPizzaWithoutLinks(secondPizza).then(body => {
          getPizzaWithoutLinks(thirdPizza).then(body => {
            getPizzaWithoutLinks(fourthPizza).then(body => {
              getPizzaWithoutLinks(fifthPizza).then(body => {
                done();
              });
            });
          });
        });
      });
    });
  });
});
