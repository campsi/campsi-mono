/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const config = require('config');
const async = require('async');
const setupBeforeEach = require('../helpers/setupBeforeEach');
const debug = require('debug')('campsi:test');
format.extend(String.prototype);
chai.use(chaiHttp);
chai.should();

const glenda = {
  displayName: 'Glenda Bennett',
  email: 'glenda@agilitation.fr',
  username: 'glenda',
  password: 'signup!'
};

const services = {
  Auth: require('../../services/auth/lib'),
  Trace: require('campsi-service-trace'),
  Assets: require('../../services/assets/lib')
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
  let context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => context.server.close(done));
  /*
   * Test the /POST local/signup route
   */
  describe('/POST local/signup [bad parameters]', () => {
    it('it should return an error', done => {
      chai
        .request(context.campsi.app)
        .post('/auth/local/signup')
        .set('content-type', 'application/json')
        .send({
          bad: 'parameters'
        })
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
  describe('/POST local/signup [user already exists]', () => {
    it('it should return an error', done => {
      createUser(context.campsi, glenda).then(() => {
        chai
          .request(context.campsi.app)
          .post('/auth/local/signup')
          .set('content-type', 'application/json')
          .send({
            displayName: 'Glenda Bennett 2',
            email: 'glenda@agilitation.fr',
            username: 'glenda',
            password: 'signup!'
          })
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
  describe('/POST local/signup [password too long]', () => {
    it('it should do something', done => {
      const campsi = context.campsi;
      chai
        .request(campsi.app)
        .post('/auth/local/signup')
        .set('content-type', 'application/json')
        .send(Object.assign({}, glenda, { password: 'l'.repeat(73) }))
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(400);
          res.should.be.json;
          res.body.should.be.a('object');
          done();
        });
    });
  });
  describe('/POST local/signup [default]', () => {
    it('it should do something', done => {
      const campsi = context.campsi;
      async.parallel(
        [
          cb => {
            chai
              .request(campsi.app)
              .post('/auth/local/signup')
              .set('content-type', 'application/json')
              .send(glenda)
              .end((err, res) => {
                if (err) debug(`received an error from chai: ${err.message}`);
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.have.property('token');
                res.body.token.should.be.a('string');
                cb();
              });
          },
          cb => {
            campsi.on('auth/local/signup', user => {
              user.should.have.property('token');
              user.should.have.property('email');
              user.should.have.property('data');
              cb();
            });
          }
        ],
        done
      );
    });
  });
  describe('/POST local/signup [merge account]', function() {
    it('it should merge the existing user account', done => {
      const campsi = context.campsi;
      chai
        .request(campsi.app)
        .get('/auth/anonymous')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          chai
            .request(campsi.app)
            .post('/auth/local/signup')
            .set('Authorization', 'Bearer ' + res.body.token)
            .send(glenda)
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.body.should.be.a('object');
              res.body.should.have.property('token');
              done();
            });
        });
    });
  });
  /*
   * Test the /GET local/validate route
   */
  describe('/GET local/validate [default]', () => {
    it.skip('it should validate the user', done => {
      const campsi = context.campsi;
      let signupPayload;
      let signinToken;

      async.parallel(
        [
          parallelCb => {
            chai
              .request(campsi.app)
              .post('/auth/local/signup')
              .set('content-type', 'application/json')
              .send(glenda)
              .end(parallelCb);
          },
          parallelCb => {
            async.series(
              [
                serieCb => {
                  campsi.on('auth/local/signup', payload => {
                    signupPayload = payload;
                    // TODO : Test is too fast and validation can failed (especially in travis)
                    // TODO : Bug is not clearly identified (node, mqtt-emitter, mongo, mongo driver)
                    // TODO : This timer seems to resolve the test failure until more investigations
                    setTimeout(serieCb, 500);
                  });
                },
                serieCb => {
                  const toURL = encodeURIComponent;
                  let validateUrl = '/auth/local/validate';
                  validateUrl += '?token=' + toURL(signupPayload.token);
                  validateUrl +=
                    '&redirectURI=' +
                    toURL('/trace/local-signup-validate-redirect');
                  chai
                    .request(campsi.app)
                    .get(validateUrl)
                    .end(serieCb);
                },
                serieCb => {
                  chai
                    .request(campsi.app)
                    .post('/auth/local/signin')
                    .set('content-type', 'application/json')
                    .send({
                      username: 'glenda',
                      password: 'signup!'
                    })
                    .end((err, res) => {
                      if (err)
                        debug(`received an error from chai: ${err.message}`);
                      res.should.have.status(200);
                      signinToken = res.body.token;
                      serieCb();
                    });
                }
              ],
              parallelCb
            );
          },
          parallelCb => {
            campsi.on('trace/request', payload => {
              payload.should.have.property('url');
              payload.url.should.eq('/local-signup-validate-redirect');
              parallelCb();
            });
          }
        ],
        () => {
          chai
            .request(campsi.app)
            .get('/auth/me')
            .set('Authorization', 'Bearer ' + signinToken)
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.should.have.status(200);
              res.should.be.json;
              res.body.should.be.an('object');
              res.body.identities.local.validated.should.eq(true);
              done();
            });
        }
      );
    });
  });
  describe('/GET local/validate [bad parameter]', () => {
    it('it should not validate the user', done => {
      const campsi = context.campsi;
      let bearerToken;
      async.series(
        [
          cb => {
            createUser(campsi, glenda).then(bearer => {
              bearerToken = bearer;
              cb();
            });
          },
          cb => {
            chai
              .request(campsi.app)
              .get(
                '/auth/local/validate?token=differentFromValidationToken&redirectURI=' +
                  encodeURIComponent('/trace/local-signup-validate-redirect')
              )
              .end((err, res) => {
                if (err) debug(`received an error from chai: ${err.message}`);
                res.should.have.status(404);
                res.should.be.json;
                res.body.should.be.a('object');
                cb();
              });
          },
          cb => {
            chai
              .request(campsi.app)
              .get('/auth/me')
              .set('Authorization', 'Bearer ' + bearerToken)
              .end((err, res) => {
                if (err) debug(`received an error from chai: ${err.message}`);
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.identities.local.validated.should.eq(false);
                cb();
              });
          }
        ],
        done
      );
    });
  });
  describe('/GET local/validate [missing parameter]', () => {
    it('it should not validate the user', done => {
      const campsi = context.campsi;
      let bearerToken;
      async.series(
        [
          cb => {
            createUser(campsi, glenda).then(bearer => {
              bearerToken = bearer;
              cb();
            });
          },
          cb => {
            chai
              .request(campsi.app)
              .get('/auth/local/validate')
              .end((err, res) => {
                if (err) debug(`received an error from chai: ${err.message}`);
                res.should.have.status(400);
                res.should.be.json;
                res.body.should.be.a('object');
                cb();
              });
          },
          cb => {
            chai
              .request(campsi.app)
              .get('/auth/me')
              .set('Authorization', 'Bearer ' + bearerToken)
              .end((err, res) => {
                if (err) debug(`received an error from chai: ${err.message}`);
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.identities.local.validated.should.eq(false);
                cb();
              });
          }
        ],
        done
      );
    });
  });
  /*
   * Test the /POST local/signin route
   */
  describe('/POST local/signin [bad paramaters]', () => {
    it('it should return an error', done => {
      const campsi = context.campsi;
      createUser(campsi, glenda).then(() => {
        chai
          .request(campsi.app)
          .post('/auth/local/signin')
          .set('content-type', 'application/json')
          .send({
            bad: 'parameters'
          })
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
  describe('/POST local/signin [bad credentials]', () => {
    it('it should sign in the user', done => {
      const campsi = context.campsi;
      createUser(campsi, glenda).then(() => {
        chai
          .request(campsi.app)
          .post('/auth/local/signin')
          .set('content-type', 'application/json')
          .send({
            username: 'glenda',
            password: 'wrong!'
          })
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
  describe('/POST local/signin [default]', () => {
    it('it should sign in the user', done => {
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
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.should.have.property('token');
            res.body.token.should.be.a('string');
            done();
          });
      });
    });
  });
});
