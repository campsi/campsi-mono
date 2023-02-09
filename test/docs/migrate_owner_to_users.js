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
const migrate = require('../../services/docs/scripts/migrate_owner_to_users');
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
async function createPizza(data, state, ownerId) {
  const resource = campsi.services.get('docs').options.resources.pizzas;
  const doc = await builder.create({ user: null, data, resource, state });
  doc.ownedBy = ownerId;
  delete doc.users;
  const result = await resource.collection.insertOne(doc);
  return result.insertedId;
}

async function getPizzaById(id) {
  const resource = campsi.services.get('docs').options.resources.pizzas;
  return await resource.collection.findOne({ _id: id });
}

// Our parent block
describe('Migrate owner to user', () => {
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
  it('it should create a pizza and add the owner in the users array', done => {
    createPizza({ name: 'margarita' }, 'published').then(id => {
      getPizzaById(id).then(pizza => {
        pizza.should.have.property('ownedBy');
        migrate([], campsi.db, ['docs.docs.pizzas']).then(() => {
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
        migrate(['--remove-ownedBy'], campsi.db, ['docs.docs.pizzas']).then(() => {
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
