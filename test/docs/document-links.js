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
const { ObjectId } = require('mongodb');

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

function deletePizza(pizzaId) {
  const filter = { _id: new ObjectId(pizzaId) };
  const resource = campsi.services.get('docs').options.resources.pizzas;
  return resource.collection.deleteOne(filter);
}
function buildPizzaDoc(data, resource, state) {
  return new Promise(function (resolve, reject) {
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
  return new Promise(function (resolve, reject) {
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
        resolve(res);
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
      getPizzaWithLinksInHeader(firstPizza).then(body => {
        body.nav.next.should.eq(secondPizza);
        body.nav.should.not.have.property('previous');
        done();
      });
    });
    it('gets 2nd pizza with correct links', done => {
      getPizzaWithLinks(secondPizza).then(body => {
        body.nav.previous.should.eq(firstPizza);
        body.nav.next.should.eq(thirdPizza);
        done();
      });
    });
    it('gets third pizza with correct links', done => {
      getPizzaWithLinksInHeader(thirdPizza).then(body => {
        body.nav.previous.should.eq(secondPizza);
        body.nav.next.should.eq(fourthPizza);
        done();
      });
    });
    it('gets fourth pizza with correct links', done => {
      getPizzaWithLinksInHeader(fourthPizza).then(body => {
        body.nav.previous.should.eq(thirdPizza);
        body.nav.next.should.eq(fifthPizza);
        done();
      });
    });
    it('gets fifth pizza with correct links', done => {
      getPizzaWithLinks(fifthPizza).then(body => {
        body.nav.should.not.have.property('next');
        body.nav.previous.should.eq(fourthPizza);
        done();
      });
    });
    it('it should get first pizza with no links returned', done => {
      getPizzaWithLinkOptionSetToFalse(firstPizza).then(body => {
        body.should.not.have.property('nav');
        body.should.not.have.property('nav');
        done();
      });
    });
    it('it should get 2nd pizza with no links returned', done => {
      getPizzaWithoutLinks(secondPizza).then(body => {
        body.should.not.have.property('nav');
        body.should.not.have.property('nav');
        done();
      });
    });
    it('it should get 3rd pizza with no links returned', done => {
      getPizzaWithoutLinksInHeader(thirdPizza).then(res => {
        res.body.should.not.have.property('nav');
        res.body.should.not.have.property('nav');
        done();
      });
    });
    it('it should get 4th pizza with no links returned', done => {
      getPizzaWithoutLinks(fourthPizza).then(body => {
        body.should.not.have.property('nav');
        body.should.not.have.property('nav');
        done();
      });
    });
    it('it should get 5th pizza with no links returned', done => {
      getPizzaWithoutLinksInHeader(fifthPizza).then(res => {
        res.body.should.not.have.property('nav');
        res.body.should.not.have.property('nav');
        done();
      });
    });
    it('should fail if I delete a document and ask for it', done => {
      deletePizza(fourthPizza).then(() => {
        getPizzaWithoutLinksInHeader(fourthPizza).then(res => {
          res.body.should.not.have.property('nav');
          res.body.should.not.have.property('nav');
          res.status.should.eq(404);
          done();
        });
      });
    });
  });
});
