/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/docs/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const debug = require('debug')('campsi:test');
const async = require('async');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const builder = require('../../services/docs/lib/modules/queryBuilder');
const { emptyDatabase } = require('../helpers/emptyDatabase');

const should = chai.should();
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

describe('State', () => {
  beforeEach(async done => {
    await emptyDatabase(config);

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

  afterEach(done => {
    server.close();
    done();
  });

  /*
   * Test the /POST docs/pizzas/:state route
   */
  describe('/POST docs/pizzas/:state', () => {
    it('it should create a document', done => {
      const data = { name: 'test' };
      chai
        .request(campsi.app)
        .post('/docs/pizzas/working_draft')
        .set('content-type', 'application/json')
        .send(data)
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
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
   * Test the /GET docs/pizzas/:id/:state route
   */
  describe('/GET docs/pizzas/:id/:state', () => {
    it('it should retreive a document by id/state', done => {
      const data = { name: 'test' };
      createPizza(data, 'working_draft')
        .then(id => {
          chai
            .request(campsi.app)
            .get('/docs/pizzas/{0}/working_draft'.format(id))
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.should.have.status(200);
              res.should.be.json;
              res.body.should.be.a('object');
              res.body.should.have.property('id');
              res.body.id.should.be.eq(id.toString());
              res.body.should.have.property('state');
              res.body.state.should.be.eq('working_draft');
              res.body.should.have.property('data');
              res.body.data.should.be.eql(data);
              done();
            });
        })
        .catch(err => {
          throw err;
        });
    });
    it('it should retreive a document by id/state with states', done => {
      const data = { name: 'test' };
      createPizza(data, 'working_draft')
        .then(id => {
          chai
            .request(campsi.app)
            .get('/docs/pizzas/{0}/working_draft?states='.format(id))
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
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
        })
        .catch(err => {
          throw err;
        });
    });
    it('it should retreive a document by id/state with states empty', done => {
      const data = { name: 'test' };
      createPizza(data, 'working_draft')
        .then(id => {
          chai
            .request(campsi.app)
            .get('/docs/pizzas/{0}/working_draft?states=published'.format(id))
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
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
        })
        .catch(err => {
          throw err;
        });
    });
  });
  /*
   * Test the /PUT docs/pizzas/:id/:state route
   */
  describe('/PUT docs/pizzas/:id/:state', () => {
    it('it should modify a document by id/state', done => {
      const data = { name: 'test' };
      const modifiedData = {
        name: 'test put',
        base: 'cream'
      };
      createPizza(data, 'working_draft')
        .then(id => {
          async.series(
            [
              function (cb) {
                chai
                  .request(campsi.app)
                  .put('/docs/pizzas/{0}/working_draft'.format(id))
                  .set('content-type', 'application/json')
                  .send(modifiedData)
                  .end((err, res) => {
                    if (err) {
                      debug(`received an error from chai: ${err.message}`);
                    }
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
                chai
                  .request(campsi.app)
                  .get('/docs/pizzas/{0}/working_draft'.format(id))
                  .end((err, res) => {
                    if (err) {
                      debug(`received an error from chai: ${err.message}`);
                    }
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
            ],
            done
          );
        })
        .catch(err => {
          throw err;
        });
    });
  });
  /*
   * Test the /PUT docs/pizzas/:id/state route
   */
  describe('/PUT docs/pizzas/:id/state', () => {
    it('it should not modify a document state by id', done => {
      const data = { name: 'test' };
      const stateData = {
        from: 'working_draft',
        to: 'published'
      };
      createPizza(data, 'working_draft')
        .then(id => {
          chai
            .request(campsi.app)
            .put('/docs/pizzas/{0}/state'.format(id))
            .set('content-type', 'application/json')
            .send(stateData)
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.should.have.status(200);
              res.should.be.json;
              res.body.should.be.a('object');
              res.body.should.have.property('doc');
              res.body.should.have.property('state');
              done();
            });
        })
        .catch(err => {
          throw err;
        });
    });
  });
  /*
   * Test the /DELETE docs/pizzas/:id/state route
   */
  describe('/DELETE docs/pizzas/:id/state', () => {
    it('it should delete a document by id', done => {
      const data = { name: 'test' };
      createPizza(data, 'working_draft')
        .then(id => {
          chai
            .request(campsi.app)
            .delete('/docs/pizzas/{0}/working_draft'.format(id))
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.should.have.status(200);
              res.should.be.json;
              res.body.should.be.a('object');
              done();
            });
        })
        .catch(err => {
          throw err;
        });
    });
    it("it should return an error when document doesn't exist", done => {
      chai
        .request(campsi.app)
        .delete('/docs/pizzas/589acbcda5756516b07cb18f/working_draft')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(404);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.have.property('message');
          done();
        });
    });
    it('it should return an error when document id is malformed', done => {
      chai
        .request(campsi.app)
        .delete('/docs/pizzas/589acbcda57/working_draft')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(400);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.have.property('message');
          done();
        });
    });
  });
});
