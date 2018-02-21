/* eslint-disable no-unused-expressions */
// During the test the env variable is set to private
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const {MongoClient} = require('mongodb');
const mongoUriBuilder = require('mongo-uri-builder');
const debug = require('debug')('campsi:test');
const async = require('async');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const builder = require('../lib/modules/queryBuilder');

let should = chai.should();
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);

const services = {
  Docs: require('../lib')
};

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
      resource.collection.insert(doc, (err, result) => {
        resolve(result.ops[0]._id);
      });
    }).catch((error) => {
      reject(error);
    });
  });
}

// Our parent block
describe('Docs', () => {
  beforeEach((done) => {
    // Empty the database
    const mongoUri = mongoUriBuilder(config.campsi.mongo);
    MongoClient.connect(mongoUri, (err, client) => {
      let db = client.db(config.campsi.mongo.database);
      db.dropDatabase(() => {
        client.close();
        campsi = new CampsiServer(config.campsi);
        campsi.mount('docs', new services.Docs(config.services.docs));

        campsi.on('campsi/ready', () => {
          server = campsi.listen(config.port);
          done();
        });

        campsi.start().catch((err) => {
          debug('Error: %s', err);
        });
      });
    });
  });

  afterEach((done) => {
    server.close();
    done();
  });
  /*
   * Test the /GET docs route
   */
  describe('/GET docs', () => {
    it('it should GET all the ressources', (done) => {
      chai.request(campsi.app)
        .get('/docs')
        .end((err, res) => {
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
          res.should.have.status(403);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.have.property('message');
          done();
        });
    });
  });
  /*
   * Test the /POST docs/pizzas/:state route
   */
  describe('/POST docs/pizzas/:state', () => {
    it('it should create a document', (done) => {
      let data = {'name': 'test'};
      chai.request(campsi.app)
        .post('/docs/pizzas/working_draft')
        .set('content-type', 'application/json')
        .send(data)
        .end((err, res) => {
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.state.should.be.eq('working_draft');
          res.body.should.have.property('id');
          res.body.should.have.property('createdAt');
          res.body.should.have.property('createdBy');
          res.body.should.have.property('data');
          res.body.data.should.be.eql(data);
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
      createPizza(data, 'working_draft').then((id) => {
        chai.request(campsi.app)
          .get('/docs/pizzas/{0}'.format(id))
          .end((err, res) => {
            res.should.have.status(404);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.should.have.property('message');
            done();
          });
      });
    });
  });
  /*
   * Test the /GET docs/pizzas/:id/:state route
   */
  describe('/GET docs/pizzas/:id/:state', () => {
    it('it should retreive a document by id/state', (done) => {
      let data = {'name': 'test'};
      createPizza(data, 'working_draft').then((id) => {
        chai.request(campsi.app)
          .get('/docs/pizzas/{0}/working_draft'.format(id))
          .end((err, res) => {
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.should.have.property('id');
            res.body.id.should.be.eq(id.toString());
            res.body.should.have.property('state');
            res.body.state.should.be.eq('working_draft');
            res.body.should.have.property('data');
            res.body.data.should.be.eql(data);
            res.body.should.not.have.property('states');
            done();
          });
      });
    });
    it('it should retreive a document by id/state with states', (done) => {
      let data = {'name': 'test'};
      createPizza(data, 'working_draft').then((id) => {
        chai.request(campsi.app)
          .get('/docs/pizzas/{0}/working_draft?states='.format(id))
          .end((err, res) => {
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.should.have.property('id');
            res.body.id.should.be.eq(id.toString());
            res.body.should.have.property('state');
            res.body.state.should.be.eq('working_draft');
            res.body.should.have.property('data');
            res.body.data.should.be.eql(data);
            res.body.should.have.property('states');
            res.body.states.should.be.a('object');
            res.body.states.should.have.property('working_draft');
            res.body.states.working_draft.should.be.a('object');
            res.body.states.working_draft.should.have.property('createdAt');
            res.body.states.working_draft.should.have.property('createdBy');
            should.equal(res.body.states.working_draft.createdBy, null);
            res.body.states.working_draft.should.have.property('data');
            res.body.states.working_draft.data.should.be.eql(data);
            done();
          });
      });
    });
    it('it should retreive a document by id/state with states empty', (done) => {
      let data = {'name': 'test'};
      createPizza(data, 'working_draft').then((id) => {
        chai.request(campsi.app)
          .get('/docs/pizzas/{0}/working_draft?states=published'.format(id))
          .end((err, res) => {
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.should.have.property('id');
            res.body.id.should.be.eq(id.toString());
            res.body.should.have.property('state');
            res.body.state.should.be.eq('working_draft');
            res.body.should.have.property('data');
            res.body.data.should.be.eql(data);
            res.body.should.have.property('states');
            res.body.states.should.be.a('object');
            res.body.states.should.be.eql({});
            done();
          });
      });
    });
  });
  /*
   * Test the /PUT docs/pizzas/:id/:state route
   */
  describe('/PUT docs/pizzas/:id/:state', () => {
    it('it should modify a document by id/state', (done) => {
      let data = {'name': 'test'};
      let modifiedData = {
        'name': 'test put',
        'base': 'cream'
      };
      createPizza(data, 'working_draft').then((id) => {
        async.series([
          function (cb) {
            chai.request(campsi.app)
              .put('/docs/pizzas/{0}/working_draft'.format(id))
              .set('content-type', 'application/json')
              .send(modifiedData)
              .end((err, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.have.property('id');
                res.body.id.should.be.eq(id.toString());
                res.body.should.have.property('state');
                res.body.state.should.be.eq('working_draft');
                res.body.should.have.property('data');
                res.body.data.should.be.eql(modifiedData);
                cb();
              });
          },
          function (cb) {
            chai.request(campsi.app)
              .get('/docs/pizzas/{0}/working_draft'.format(id))
              .end((err, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.have.property('id');
                res.body.id.should.be.eq(id.toString());
                res.body.should.have.property('state');
                res.body.state.should.be.eq('working_draft');
                res.body.should.have.property('createdAt');
                res.body.should.have.property('createdBy');
                should.equal(res.body.createdBy, null);
                res.body.should.have.property('modifiedAt');
                res.body.should.have.property('modifiedBy');
                should.equal(res.body.modifiedBy, null);
                res.body.should.have.property('data');
                res.body.data.should.be.eql(modifiedData);
                cb();
              });
          }
        ], done);
      });
    });
  });
  /*
   * Test the /GET docs/pizzas/:id/state route
   */
  describe('/GET docs/pizzas/:id/state', () => {
    it('it should return all documents states', (done) => {
      let data = {'name': 'test'};
      createPizza(data, 'working_draft').then((id) => {
        chai.request(campsi.app)
          .get('/docs/pizzas/{0}/state'.format(id))
          .end((err, res) => {
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.should.have.property('id');
            res.body.id.should.be.eq(id.toString());
            res.body.should.have.property('states');
            res.body.states.should.be.a('object');
            res.body.states.should.have.property('working_draft');
            res.body.states.working_draft.should.have.property('createdAt');
            res.body.states.working_draft.should.have.property('createdBy');
            should.equal(res.body.states.working_draft.createdBy, null);
            done();
          });
      });
    });
  });
  /*
   * Test the /PUT docs/pizzas/:id/state route
   */
  describe('/PUT docs/pizzas/:id/state', () => {
    it('it should modify a document state by id', (done) => {
      let data = {'name': 'test'};
      let stateData = {
        'from': 'working_draft',
        'to': 'published'
      };
      createPizza(data, 'working_draft').then((id) => {
        chai.request(campsi.app)
          .put('/docs/pizzas/{0}/state'.format(id))
          .set('content-type', 'application/json')
          .send(stateData)
          .end((err, res) => {
            res.should.have.status(403);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.should.have.property('message');
            done();
          });
      });
    });
  });
  /*
   * Test the /DELETE docs/pizzas/:id/state route
   */
  describe('/DELETE docs/pizzas/:id/state', () => {
    it('it should delete a document by id', (done) => {
      let data = {'name': 'test'};
      createPizza(data, 'working_draft').then((id) => {
        chai.request(campsi.app)
          .delete('/docs/pizzas/{0}/working_draft'.format(id))
          .end((err, res) => {
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.a('object');
            done();
          });
      });
    });
    it('it should return an error when document doesn\'t exist', (done) => {
      chai.request(campsi.app)
        .delete('/docs/pizzas/589acbcda5756516b07cb18f/working_draft')
        .end((err, res) => {
          res.should.have.status(404);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.have.property('message');
          done();
        });
    });
    it('it should return an error when document id is malformed', (done) => {
      chai.request(campsi.app)
        .delete('/docs/pizzas/589acbcda57/working_draft')
        .end((err, res) => {
          res.should.have.status(400);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.have.property('message');
          done();
        });
    });
  });
});
