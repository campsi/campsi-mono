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
const migrate = require('../../services/docs/scripts/migrate_owner_to_users');

chai.should();
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);

const services = {
  Docs: require('../../services/docs/lib')
};

// Helpers
function createPizza(data, state, ownerId) {
  return new Promise(function(resolve, reject) {
    const resource = campsi.services.get('docs').options.resources.pizzas;
    builder
      .create({
        user: null,
        data,
        resource,
        state
      })
      .then(doc => {
        doc.ownedBy = ownerId;
        delete doc.users;
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

function getPizzaById(id) {
  return new Promise(function(resolve, reject) {
    const resource = campsi.services.get('docs').options.resources.pizzas;
    resource.collection.findOne({ _id: id }, (err, pizza) => {
      return err ? reject(err) : resolve(pizza);
    });
  });
}

// Our parent block
describe('CRUD', () => {
  beforeEach(done => {
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
          done();
        });

        campsi.start().catch(err => {
          debug('Error: %s', err);
        });
      });
    });
  });

  afterEach(done => {
    server.close();
    done();
  });
  it('it should create a pizza and add the owner in the users array', done => {
    createPizza({ name: 'margarita' }, 'published').then(id => {
      getPizzaById(id).then(pizza => {
        pizza.should.have.property('ownedBy');
        migrate([], campsi.db, ['docs.docs.pizzas'], () => {
          getPizzaById(id).then(pizza => {
            pizza.should.have.property('users');
            done();
          });
        });
      });
    });
  });

  it('it should create a pizza and add the owner in the users array', done => {
    createPizza({ name: 'margarita' }, 'published').then(id => {
      getPizzaById(id).then(pizza => {
        pizza.should.have.property('ownedBy');
        migrate(['--remove-ownedBy'], campsi.db, ['docs.docs.pizzas'], () => {
          getPizzaById(id).then(pizza => {
            pizza.should.have.property('users');
            pizza.should.not.have.property('ownedBy');
            done();
          });
        });
      });
    });
  });
});
