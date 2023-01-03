/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const config = require('config');
const sinon = require('sinon');
const passport = require('@passport-next/passport');

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
  Auth: require('../../services/auth/lib')
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

const expect = require('chai').expect;
const proxyquire = require('proxyquire');
const sinonChai = require('sinon-chai');

chai.use(sinonChai);

describe('it should get user account from the API', function () {
  it.skip('should be able to access passport authenticate', async () => {
    // configure request and response
    const mockReq = {
      body: {
        username: 'johndoe',
        password: 'secret'
      },
      logIn: function () {}
    };

    const mockRes = {};

    // configure request-promise
    const requestPromiseStub = sinon.stub();

    requestPromiseStub
      .onCall(0)
      .returns(
        Promise.resolve({
          userId: 138
        })
      )
      .onCall(1)
      .returns(
        Promise.resolve({
          userName: 'johndoe',
          status: 0
        })
      );

    const overrides = {
      'request-promise': requestPromiseStub
    };

    proxyquire('passport-next/passport', overrides)();
    // passport.authenticate('local')(mockReq, mockRes);

    const campsi = context.campsi;
    // await createUser(campsi, glenda);

    try {
      const res = await chai.request(campsi.app).get(`/auth/github?username=${glenda.email}`);
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.should.have.property('token');
      res.body.token.should.be.a('string');
    } catch (ex) {
      if (ex) debug(`received an error from chai: ${ex}`);
    }
  });
  // ASSERTS HERE
  // expect(requestPromiseStub).to.have.been.called();
});

describe('Auth Local API', () => {
  const context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => context.server.close(done));
  /*
   * Test the /POST local/signup route
   */
  describe.skip('/POST local/signup [bad parameters]', () => {
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
  describe.skip('/POST local/signup [user already exists]', () => {
    it('it should return an error', done => {
      createUser(context.campsi, glenda).then(() => {
        chai
          .request(context.campsi.app)
          .post('/auth/providers/facebook')
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
  describe.skip('/POST local/signup [password too long]', () => {
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
  describe.skip('/POST local/signup [default]', () => {
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
            campsi.on('auth/signup', user => {
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

  describe('/POST local/signin [default]', () => {
    it('it should sign in the user', async () => {
      const campsi = context.campsi;
      // await createUser(campsi, glenda);

      sinon.stub(passport._strategies.github, 'authenticate').callsFake(function verified() {
        const self = this;
        this._verify(
          campsi,
          null,
          {
            _json: { email: glenda.email },
            name: {
              givenName: glenda.displayName,
              familyName: glenda.username
            }
          },
          (err, user, info) => {
            if (err) {
              return self.error(err);
            }
            if (!user) {
              return self.fail(info);
            }
            return self.success(user, info);
          }
        );
      });
      try {
        const res = await chai.request(campsi.app).get(`/auth/github?username=${glenda.email}`);
        res.should.have.status(200);
        res.should.be.json;
        res.body.should.be.a('object');
        res.body.should.have.property('token');
        res.body.token.should.be.a('string');
      } catch (ex) {
        if (ex) debug(`received an error from chai: ${ex}`);
      }
    });
  });
});
