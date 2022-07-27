/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const config = require('config');
const { btoa } = require('../../services/auth/lib/modules/base64');
const createUser = require('../helpers/createUser');
const debug = require('debug')('campsi:test');
const setupBeforeEach = require('../helpers/setupBeforeEach');
const expect = chai.expect;
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
  Trace: require('../../services/trace/lib'),
  Assets: require('../../services/assets/lib')
};

describe('Auth API', () => {
  const context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => {
    context.server.close(done);
  });
  /*
   * Test the /GET providers route
   */
  describe('/GET providers', () => {
    it('it should return a list of providers', done => {
      chai
        .request(context.campsi.app)
        .get('/auth/providers')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('array');
          res.body.length.should.be.eq(2);
          res.body[0].should.be.an('object');
          res.body[0].should.have.property('name');
          res.body[0].name.should.be.a('string');
          res.body[0].name.should.be.eq('local');
          done();
        });
    });
  });
  /*
   * Test the /GET me route
   */
  describe('/GET me [not connected]', () => {
    it('it should return an error when not connected', done => {
      chai
        .request(context.campsi.app)
        .get('/auth/me')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(401);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.have.property('message');
          done();
        });
    });
  });
  describe('/GET me [connected]', () => {
    it('it should return user when connected', done => {
      const campsi = context.campsi;
      createUser(chai, campsi, glenda).then(token => {
        chai
          .request(campsi.app)
          .get('/auth/me')
          .set('Authorization', 'Bearer ' + token)
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.should.have.property('displayName');
            res.body.should.have.property('email');
            res.body.should.have.property('identities');
            res.body.should.have.property('token');
            done();
          });
      });
    });
  });

  describe('/GET anonymous', () => {
    it('it should create an anonymous user with a token', done => {
      const campsi = context.campsi;
      chai
        .request(campsi.app)
        .get('/auth/anonymous')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.have.property('token');
          done();
        });
    });
  });

  /*
   * Test the /GET logout route
   */
  describe('/GET logout [not connected]', () => {
    it('it should return error if not connected', done => {
      const campsi = context.campsi;
      chai
        .request(campsi.app)
        .get('/auth/logout')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(401);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.have.property('message');
          done();
        });
    });
  });
  describe('/GET logout [connected]', () => {
    it('it should return success & token must disappear from database', done => {
      const campsi = context.campsi;
      createUser(chai, campsi, glenda).then(token => {
        chai
          .request(campsi.app)
          .get('/auth/logout')
          .set('Authorization', 'Bearer ' + token)
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.should.have.property('message');
            // bdd token must be undefined
            const filter = {};
            filter['token.value'] = token;
            campsi.db
              .collection('__users__')
              .findOne(filter)
              .then(user => {
                expect(user).to.be.null;
                done();
              })
              .catch(error => {
                done(new Error(error));
              });
          });
      });
    });
  });
  /*
   * Test redirection
   */
  describe('redirection must redirect to correct page', () => {
    it('it shoud redirect on /me page on successful connection', done => {
      const campsi = context.campsi;
      createUser(chai, campsi, glenda).then(() => {
        const state = btoa(
          JSON.stringify({
            redirectURI: '/auth/me'
          })
        );
        chai
          .request(campsi.app)
          .post('/auth/local/signin?state=' + state)
          .set('content-type', 'application/json')
          .send({
            username: 'glenda',
            password: 'signup!'
          })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.should.have.property('displayName');
            res.body.should.have.property('email');
            res.body.should.have.property('identities');
            res.body.should.have.property('token');
            done();
          });
      });
    });
  });

  /*
   * Test redirection
   */
  describe('signin should return JSON when Ajax', () => {
    it('it should work', done => {
      const campsi = context.campsi;
      createUser(chai, campsi, glenda).then(() => {
        chai
          .request(campsi.app)
          .post('/auth/local/signin')
          .set('content-type', 'application/json')
          .set('Referer', 'https://www.campsi.io')
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({
            username: 'glenda',
            password: 'signup!'
          })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.should.have.property('token');
            done();
          });
      });
    });
  });

  describe('send a PUT on /me should update the user', () => {
    it('it should modify the display name', done => {
      const campsi = context.campsi;
      createUser(chai, campsi, glenda, true).then(token => {
        chai
          .request(campsi.app)
          .put('/auth/me')
          .set('content-type', 'application/json')
          .set('Authorization', 'Bearer ' + token)
          .send({
            displayName: 'Eric Thomas'
          })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.should.be.a('object');
            res.body.should.have.property('displayName');
            res.body.displayName.should.equal('Eric Thomas');
            done();
          });
      });
    });

    it('it should add a data property', done => {
      const campsi = context.campsi;
      createUser(chai, campsi, glenda, true).then(token => {
        chai
          .request(campsi.app)
          .put('/auth/me')
          .set('content-type', 'application/json')
          .set('Authorization', 'Bearer ' + token)
          .send({
            data: {
              stuffThatILike: ['trains']
            }
          })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.should.be.a('object');
            res.body.should.have.property('data');
            res.body.data.should.be.a('object');
            res.body.data.stuffThatILike.should.be.a('array');
            done();
          });
      });
    });
  });

  describe('list users', () => {
    it('should list existing users', done => {
      const campsi = context.campsi;
      const admin = {
        email: 'admin@campsi.io',
        username: 'admin@campsi.io',
        displayName: 'admin',
        password: 'password'
      };
      createUser(chai, campsi, admin, true).then(adminToken => {
        campsi.db
          .collection('__users__')
          .findOneAndUpdate({ email: admin.email }, { $set: { isAdmin: true } }, { returnDocument: 'after' })
          .then(updateResult => {
            createUser(chai, campsi, glenda).then(userToken => {
              chai
                .request(campsi.app)
                .get('/auth/users')
                .set('Authorization', 'Bearer ' + adminToken)
                .end((err, res) => {
                  if (err) {
                    debug(err);
                    return done();
                  }
                  res.should.have.status(200);
                  res.body.should.be.a('array');
                  res.body.length.should.be.equal(2);
                  // glenda
                  const userId = res.body.filter(u => u.email === glenda.email)[0]._id;
                  chai
                    .request(campsi.app)
                    .get(`/auth/users/${userId}/access_token`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .end((err, res) => {
                      debug(err);
                      debug(res.body);
                      res.should.have.status(200);
                      res.body.should.have.property('token');
                      done();
                    });
                });
            });
          });
      });
    });
  });

  describe('delete a user', () => {
    it('should delete an existing user', done => {
      const campsi = context.campsi;
      const admin = {
        email: 'admin@campsi.io',
        username: 'admin@campsi.io',
        displayName: 'admin',
        password: 'password'
      };
      createUser(chai, campsi, admin, true).then(adminToken => {
        campsi.db
          .collection('__users__')
          .findOneAndUpdate({ email: admin.email }, { $set: { isAdmin: true } }, { returnDocument: 'after' })
          .then(updateResult => {
            createUser(chai, campsi, glenda).then(userToken => {
              chai
                .request(campsi.app)
                .get('/auth/users')
                .set('Authorization', 'Bearer ' + adminToken)
                .end((err, res) => {
                  if (err) {
                    debug(err);
                    return done();
                  }
                  res.should.have.status(200);
                  // glenda
                  const userId = res.body.filter(u => u.email === glenda.email)[0]._id;
                  chai
                    .request(campsi.app)
                    .delete(`/auth/users/${userId}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .end((err, res) => {
                      debug(err);
                      debug(res.body);
                      const body = res.body;
                      res.should.have.status(200);
                      body.email.should.be.empty;
                      body.displayName.should.be.empty;
                      body.picture.should.be.empty;
                      expect(new Date(body.deletedOn).getTime()).to.be.closeTo(Date.now(), 1000);
                      Object.keys(body.data).length.should.be.equal(0);
                      Object.keys(body.identities).length.should.be.equal(0);

                      chai
                        .request(campsi.app)
                        .delete(`/auth/users/${userId}`)
                        .set('Authorization', `Bearer ${adminToken}`)
                        .end((err, res) => {
                          debug(err);
                          debug(res.body);
                          res.should.have.status(404);
                          done();
                        });
                    });
                });
            });
          });
      });
    });
    it('should not allow us to delete an existing user if we are not admin', done => {
      const campsi = context.campsi;
      const admin = {
        email: 'admin@campsi.io',
        username: 'admin@campsi.io',
        displayName: 'admin',
        password: 'password'
      };
      createUser(chai, campsi, admin, true).then(adminToken => {
        campsi.db
          .collection('__users__')
          .findOneAndUpdate({ email: admin.email }, { $set: { isAdmin: true } }, { returnDocument: 'after' })
          .then(updateResult => {
            createUser(chai, campsi, glenda).then(userToken => {
              chai
                .request(campsi.app)
                .get('/auth/users')
                .set('Authorization', 'Bearer ' + adminToken)
                .end((err, res) => {
                  if (err) {
                    debug(err);
                    return done();
                  }
                  res.should.have.status(200);
                  // delete with glenda's profile (not admin)
                  const userId = res.body.filter(u => u.email === glenda.email)[0]._id;
                  chai
                    .request(campsi.app)
                    .delete(`/auth/users/${userId}`)
                    .set('Authorization', `Bearer ${userToken}`)
                    .end((_err, res) => {
                      res.should.have.status(400);
                      done();
                    });
                });
            });
          });
      });
    });
  });

  describe('invitation', () => {
    it('should create a new user', done => {
      const campsi = context.campsi;
      createUser(chai, campsi, glenda, true).then(token => {
        chai
          .request(campsi.app)
          .post('/auth/invitations')
          .set('content-type', 'application/json')
          .set('Authorization', 'Bearer ' + token)
          .send({
            email: 'invitee@campsi.io',
            displayName: 'The user invited by glenda'
          })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.should.be.a('object');
            res.body.should.have.property('id');
            debug(res.body);
            done();
          });
      });
    });

    it('should not create a new user', done => {
      const campsi = context.campsi;
      const robert = {
        displayName: 'Robert Bennett',
        email: 'robert@agilitation.fr',
        username: 'robert',
        password: 'signup!'
      };
      createUser(chai, campsi, robert)
        .then(createUser(chai, campsi, glenda, true))
        .then(token => {
          chai
            .request(campsi.app)
            .post('/auth/invitations')
            .set('content-type', 'application/json')
            .set('Authorization', 'Bearer ' + token)
            .send({
              email: 'robert@agilitation.fr'
            })
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.should.have.status(200);
              res.should.be.json;
              res.should.be.a('object');
              res.body.should.have.property('id');
              debug(res.body);
              campsi.db.collection('__users__').findOne({ email: robert.email }, (err, doc) => {
                if (err) return debug(`received an error from chai: ${err.message}`);
                doc.should.be.a('object');
                res.body.id.should.be.eq(doc._id.toString());
                done();
              });
            });
        });
    });
    it('should allow someone else to use the invitation', done => {
      const campsi = context.campsi;
      const robert = {
        displayName: 'Robert Bennett',
        email: 'robert@agilitation.fr',
        username: 'robert',
        password: 'signup!'
      };
      createUser(chai, campsi, robert)
        .then(robertToken => {
          robert.token = robertToken;
          return createUser(chai, campsi, glenda);
        })
        .then(glendaToken => {
          debug(glendaToken);
          chai
            .request(campsi.app)
            .post('/auth/invitations')
            .set('content-type', 'application/json')
            .set('Authorization', 'Bearer ' + glendaToken)
            .send({
              email: 'odile@agilitation.fr',
              data: { projectId: 'testProjectId' }
            })
            .end((err, res) => {
              if (err) return debug(`received an error from chai: ${err.message}`);
              const invitationToken = res.body.invitationToken;
              chai
                .request(campsi.app)
                .post(`/auth/invitations/${invitationToken.value}`)
                .set('Authorization', 'Bearer ' + robert.token)
                .end();

              campsi.on('auth/invitation/accepted', payload => {
                payload.should.have.property('invitedBy');
                payload.should.have.property('invitedUserId');
                payload.should.have.property('data');
                payload.data.projectId.should.eq('testProjectId');

                chai
                  .request(campsi.app)
                  .post(`/auth/invitations/${invitationToken.value}`)
                  .set('Authorization', 'Bearer ' + glendaToken)
                  .end((err, res) => {
                    if (err) return debug(`received an error from chai: ${err.message}`);
                    res.should.have.status(404);
                    done();
                  });
              });
            });
        });
    });
  });
});
