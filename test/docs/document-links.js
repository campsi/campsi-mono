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

function getPizzaWithLinksInHeader(id) {
  return new Promise(resolve => {
    chai
      .request(campsi.app)
      .get(`/docs/pizzas/${id}`)
      .set({ 'With-Links': true })
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

function getPizzaWithLinkOptionSetToFalse(id) {
  return new Promise(resolve => {
    chai
      .request(campsi.app)
      .get(`/docs/pizzas/${id}?withLinks=false`)
      .end((err, res) => {
        if (err) debug(`received an error from chai: ${err.message}`);
        resolve(res.body);
      });
  });
}

function getPizzaWithoutLinksInHeader(id) {
  return new Promise(resolve => {
    chai
      .request(campsi.app)
      .get(`/docs/pizzas/${id}`)
      .set({ 'With-Links': false })
      .end((err, res) => {
        if (err) console.log(`received an error from chai: ${err.message}`);
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
  describe('/GET pizzas starting from the first all the way to last following the links', () => {
    it('gets first pizza with correct links', done => {
      getPizzaWithLinks(firstPizza).then(body => {
        body.next_id.should.eq(secondPizza);
        body.should.not.have.property('previous_id');
        done();
      });
    });
    it('gets 2nd pizza with correct links', done => {
      getPizzaWithLinksInHeader(secondPizza).then(body => {
        body.previous_id.should.eq(firstPizza);
        body.next_id.should.eq(thirdPizza);
        done();
      });
    });
    it('gets third pizza with correct links', done => {
      getPizzaWithLinks(thirdPizza).then(body => {
        body.previous_id.should.eq(secondPizza);
        body.next_id.should.eq(fourthPizza);
        done();
      });
    });
    it('gets fourth pizza with correct links', done => {
      getPizzaWithLinksInHeader(fourthPizza).then(body => {
        body.previous_id.should.eq(thirdPizza);
        body.next_id.should.eq(fifthPizza);
        done();
      });
    });
    it('gets fifth pizza with correct links', done => {
      getPizzaWithLinks(fifthPizza).then(body => {
        body.should.not.have.property('next_id');
        body.previous_id.should.eq(fourthPizza);
        done();
      });
    });
  });

  /*
   * Test the /GET docs/pizzas route
   */
  describe('/GET each pizza one by one with links switched off or set to false, checks for no links', () => {
    it('it should get first pizza with no links returned', done => {
      getPizzaWithLinkOptionSetToFalse(firstPizza).then(body => {
        body.should.not.have.property('next_id');
        body.should.not.have.property('previous_id');
        done();
      });
    });
    it('it should get 2nd pizza with no links returned', done => {
      getPizzaWithoutLinks(secondPizza).then(body => {
        body.should.not.have.property('next_id');
        body.should.not.have.property('previous_id');
        done();
      });
    });
    it('it should get 3rd pizza with no links returned', done => {
      getPizzaWithoutLinksInHeader(thirdPizza).then(body => {
        body.should.not.have.property('next_id');
        body.should.not.have.property('previous_id');
        done();
      });
    });
    it('it should get 4th pizza with no links returned', done => {
      getPizzaWithoutLinks(fourthPizza).then(body => {
        body.should.not.have.property('next_id');
        body.should.not.have.property('previous_id');
        done();
      });
    });
    it('it should get 5th pizza with no links returned', done => {
      getPizzaWithoutLinksInHeader(fifthPizza).then(body => {
        body.should.not.have.property('next_id');
        body.should.not.have.property('previous_id');
        done();
      });
    });
  });
});
