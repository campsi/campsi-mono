/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const {MongoClient} = require('mongodb');
const mongoUriBuilder = require('mongo-uri-builder');
const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const async = require('async');

chai.should();
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);

const services = {
  Docs: require('../lib')
};

const me = {_id: 'me'};

// Our parent block
describe('Events', () => {
  beforeEach((done) => {
    // Empty the database
    const mongoUri = mongoUriBuilder(config.campsi.mongo);
    MongoClient.connect(mongoUri, (err, client) => {
      if (err) throw err;
      let db = client.db(config.campsi.mongo.database);
      db.dropDatabase(() => {
        client.close();
        campsi = new CampsiServer(config.campsi);
        campsi.mount('docs', new services.Docs(config.services.docs));
        campsi.app.use((req, res, next) => {
          req.user = me;
          next();
        });

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
   * Test owner role
   */
  describe('events', () => {
    it('should dispatch events for POST / PUT / SET STATE / DELETE', done => {
      async.parallel([
        cb => {
          campsi.on('docs/document/created', payload => {
            debug('docs/document/created');
            payload.should.have.property('documentId');
            payload.should.have.property('state');
            payload.data.name.should.eq('test');
            cb();
          });
        },
        cb => {
          campsi.on('docs/document/updated', payload => {
            debug('docs/document/updated');
            payload.should.have.property('documentId');
            payload.should.have.property('state');
            payload.data.name.should.eq('test modified');
            cb();
          });
        },
        cb => {
          campsi.on('docs/document/state/changed', payload => {
            debug('docs/document/state/changed', payload);
            cb();
          });
        },
        cb => {
          campsi.on('docs/document/deleted', payload => {
            debug('docs/document/deleted', payload);
            payload.should.have.property('documentId');
            cb();
          });
        }
      ], done);

      let documentId;
      async.series([
        cb => { // POST
          chai.request(campsi.app)
            .post('/docs/simple/state-public')
            .set('content-type', 'application/json')
            .send({name: 'test'})
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              documentId = res.body.id;
              cb();
            });
        },
        cb => { // PUT
          chai.request(campsi.app)
            .put(`/docs/simple/${documentId}`)
            .set('content-type', 'application/json')
            .send({name: 'test modified'})
            .end(cb);
        },
        cb => { // CHANGE STATE
          chai.request(campsi.app)
            .put(`/docs/simple/${documentId}/state`)
            .set('content-type', 'application/json')
            .send({from: 'state-public', to: 'state-basic'})
            .end(cb);
        },
        cb => { // DELETE
          chai.request(campsi.app)
            .delete(`/docs/simple/${documentId}`)
            .set('content-type', 'application/json')
            .end(cb);
        }
      ]);
    });
    it('should dispatch events for document users POST / PUT / DELETE', done => {
      // event listeners
      async.parallel([
        cb => {
          campsi.on('docs/document/users/added', payload => {
            debug(payload);
            cb();
          });
        },
        cb => {
          campsi.on('docs/document/users/removed', payload => {
            debug(payload);
            cb();
          });
        }
      ], done);
      let documentId;
      // requests
      async.series([
        cb => {
          chai.request(campsi.app).post('/docs/simple')
            .send({name: 'test'})
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              documentId = res.body.id;
              cb();
            });
        },
        cb => {
          chai.request(campsi.app).post(`/docs/simple/${documentId}/users`)
            .set('content-type', 'application/json')
            .send({_id: 'not_me', roles: ['owner']})
            .end(cb);
        },
        cb => {
          chai.request(campsi.app).delete(`/docs/simple/${documentId}/users/not_me`).end(cb);
        }
      ]);
    });
  });
});
