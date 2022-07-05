/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const config = require('config');
const setupBeforeEach = require('../helpers/setupBeforeEach');
const debug = require('debug')('campsi:test');
const { ObjectId } = require('mongodb');

format.extend(String.prototype);
chai.use(chaiHttp);
chai.should();

const glenda = {
  displayName: 'Glenda Bennett',
  email: 'glenda@agilitation.fr',
  username: 'glenda',
  password: 'signup!'
};

const glenda2 = {
  displayName: 'Glenda Bennett2',
  email: 'glenda2@agilitation.fr',
  username: 'glenda2',
  password: 'signup!'
};

const services = {
  Auth: require('../../services/auth/lib'),
  Trace: require('campsi-service-trace'),
  Assets: require('../../services/assets/lib'),
  Docs: require('../../services/docs/lib')
};

function createUser(campsi, user) {
  return new Promise((resolve, reject) => {
    chai
      .request(campsi.app)
      .post('/auth/local/signup')
      .set('content-type', 'application/json')
      .send(user)
      .end((err, res) => {
        if (err) return reject(err);
        resolve(res.body.token);
      });
  });
}

describe('Auth Local API', () => {
  const context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => context.server.close(done));

  describe('/PUT docs as a user', () => {
    it('it should create 2 users and try to update a doc and get the correct status code', done => {
      const campsi = context.campsi;
      createUser(campsi, glenda).then(() => {
        chai
          .request(campsi.app)
          .post('/auth/local/signin')
          .set('content-type', 'application/json')
          .send({
            username: 'Glenda@agilitation.fr',
            password: 'signup!'
          })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            const token = res.body.token;
            const campsi = context.campsi;
            chai
              .request(campsi.app)
              .post('/docs/opening_hours')
              .set('content-type', 'application/json')
              .set('Authorization', 'Bearer ' + token)
              .send({ name: 'test doc' })
              .end((_err, res) => {
                const id = res.body.id;
                createUser(campsi, glenda2).then(() => {
                  chai
                    .request(campsi.app)
                    .post('/auth/local/signin')
                    .set('content-type', 'application/json')
                    .send({
                      username: 'Glenda2@agilitation.fr',
                      password: 'signup!'
                    })
                    .end((_err, res) => {
                      const token2 = res.body.token;
                      chai
                        .request(campsi.app)
                        .put(`/docs/opening_hours/${id}`)
                        .set('content-type', 'application/json')
                        .set('Authorization', 'Bearer ' + token2)
                        .send({ name: 'test modified' })
                        .end((_err, res) => {
                          res.should.have.status(401);

                          chai
                            .request(campsi.app)
                            .put(`/docs/opening_hours/${id}`)
                            .set('content-type', 'application/json')
                            .set('Authorization', 'Bearer ' + token)
                            .send({ name: 'test modified' })
                            .end((_err, res) => {
                              res.should.have.status(200);

                              const id  = new ObjectId().toHexString();

                              chai
                                .request(campsi.app)
                                .put(`/docs/opening_hours/${id.toString()}`)
                                .set('content-type', 'application/json')
                                .set('Authorization', 'Bearer ' + token)
                                .send({ name: 'test modified' })
                                .end((_err, res) => {
                                  res.should.have.status(404);
                                  done();
                                });
                            });
                        });
                    });
                });
              });
          });
      });
    });
  });
});
