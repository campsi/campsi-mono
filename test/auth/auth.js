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
const { getUsersCollectionName } = require('../../services/auth/lib/modules/collectionNames');
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

const identities = {
  google: {
    id: '111111111111111111111',
    sub: '111111111111111111111',
    name: 'Glenda Bennett',
    given_name: 'Glenda',
    family_name: 'Bennett',
    picture: 'https://lh3.googleusercontent.com/a/AItbvmmG_9I4BLRBt_pnttW2mknH0OGckY7_U6vud2t4=s96-c',
    email: 'glenda@agilitation.fr',
    email_verified: true,
    locale: 'en'
  },
  facebook: {
    id: '111111111111111111111',
    name: 'Glenda Bennett',
    email: 'glenda@agilitation.fr'
  }
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
              .collection(getUsersCollectionName())
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
          .collection(getUsersCollectionName())
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
              campsi.db.collection(getUsersCollectionName()).findOne({ email: robert.email }, (err, doc) => {
                if (err) return debug(`received an error from chai: ${err.message}`);
                doc.should.be.a('object');
                res.body.id.should.be.eq(doc._id.toString());
                done();
              });
            });
        });
    });
    it('should allow someone else to use the invitation', async () => {
      const campsi = context.campsi;
      const robert = {
        displayName: 'Robert Bennett',
        email: 'robert@agilitation.fr',
        username: 'robert',
        password: 'signup!'
      };
      const robertToken = await createUser(chai, campsi, robert);
      const glendaToken = await createUser(chai, campsi, glenda);

      debug(glendaToken);

      try {
        const res = await chai
          .request(campsi.app)
          .post('/auth/invitations')
          .set('content-type', 'application/json')
          .set('Authorization', 'Bearer ' + glendaToken)
          .send({
            email: 'odile@agilitation.fr',
            data: { projectId: 'testProjectId' }
          });

        const invitationToken = res.body.invitationToken;
        debug(res.status);
        debug(invitationToken);
        const inviteAcceptedPromise = new Promise((resolve, reject) => {
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
                if (err) reject(debug(`received an error from chai: ${err.message}`));
                res.should.have.status(404);
                resolve();
              });
          });
        });

        const inviteAcceptRes = await chai
          .request(campsi.app)
          .post(`/auth/invitations/${invitationToken.value}`)
          .set('Authorization', 'Bearer ' + robertToken);

        debug(inviteAcceptRes);

        await inviteAcceptedPromise;
      } catch (error) {
        debug(error);
      }
    }).timeout(10000);
  });

  describe('extract user personal data', () => {
    it('should extract personal data', async () => {
      const campsi = context.campsi;
      const admin = {
        email: 'admin@campsi.io',
        username: 'admin@campsi.io',
        displayName: 'admin',
        password: 'password'
      };

      // create two users, one admin one lamba
      const adminToken = await createUser(chai, campsi, admin, true);
      await campsi.db.collection('__users__').findOneAndUpdate({ email: admin.email }, { $set: { isAdmin: true } });

      await createUser(chai, campsi, glenda);

      // add facebook and google identites to glenda
      await campsi.db
        .collection('__users__')
        .findOneAndUpdate(
          { email: glenda.email },
          { $set: { 'identities.facebook': identities.facebook, 'identities.google': identities.google } }
        );

      let res = await chai
        .request(campsi.app)
        .get('/auth/users')
        .set('Authorization', 'Bearer ' + adminToken);

      res.should.have.status(200);

      // get glenda's id
      const glendaId = res.body.filter(u => u.email === glenda.email)[0]._id;

      // get the personal data based on user id
      res = await chai
        .request(campsi.app)
        .get(`/auth/users/${glendaId}/extract_personal_data`)
        .set('Authorization', 'Bearer ' + adminToken);

      res.body.identities.local.id.should.equal(glenda.username);
      res.body.identities.local.username.should.equal(glenda.username);
      res.body.identities.facebook.name.should.equal(identities.facebook.name);
      res.body.identities.facebook.email.should.equal(identities.facebook.email);
      res.body.identities.google.name.should.equal(identities.google.name);
      res.body.identities.google.given_name.should.equal(identities.google.given_name);
      res.body.identities.google.picture.should.equal(identities.google.picture);
      res.body.identities.google.email.should.equal(identities.google.email);
    });

    it('should return a not authorized error', async () => {
      const campsi = context.campsi;
      const admin = {
        email: 'admin@campsi.io',
        username: 'admin@campsi.io',
        displayName: 'admin',
        password: 'password'
      };

      // create two users one admin one lambda
      const adminToken = await createUser(chai, campsi, admin, true);
      await campsi.db.collection('__users__').findOneAndUpdate({ email: admin.email }, { $set: { isAdmin: true } });

      const glendaToken = await createUser(chai, campsi, glenda);

      let res = await chai
        .request(campsi.app)
        .get('/auth/users')
        .set('Authorization', 'Bearer ' + adminToken);

      res.should.have.status(200);

      // get glenda's id
      const glendaId = res.body.filter(u => u.email === glenda.email)[0]._id;

      // should return a 401 error
      res = await chai
        .request(campsi.app)
        .get(`/auth/users/${glendaId}/extract_personal_data`)
        .set('Authorization', 'Bearer ' + glendaToken);
    });
  });
});
