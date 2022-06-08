/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const createUser = require('../helpers/createUser');
const setupBeforeEach = require('../helpers/setupBeforeEach');
const config = require('config');
const debug = require('debug')('campsi:test');

format.extend(String.prototype);
chai.use(chaiHttp);
chai.should();

const firstPassword = 'signup!';

const glenda = {
  displayName: 'Glenda Bennett',
  email: 'glenda@agilitation.fr',
  username: 'glenda',
  password: firstPassword
};

const services = {
  Auth: require('../../services/auth/lib'),
  Trace: require('campsi-service-trace'),
  Assets: require('../../services/assets/lib')
};

const signin = (chai, campsi, username, password) =>
  chai
    .request(campsi.app)
    .post('/auth/local/signin')
    .send({ username, password });

const createResetPasswordToken = (chai, campsi, email) =>
  chai
    .request(campsi.app)
    .post('/auth/local/reset-password-token')
    .send({ email });

const resetUserPassword = (chai, campsi, username, passwordResetToken, newPassword) =>
  chai
    .request(campsi.app)
    .post('/auth/local/reset-password')
    .send({
      username,
      token: passwordResetToken,
      password: newPassword
    });

describe('Auth Local Password Reset', () => {
  const context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => context.server.close(done));
  /*
   * Test the /GET local/validate route
   */
  describe('/GET local/reset password [default]', () => {
    it('it should validate the user', done => {
      const campsi = context.campsi;
      const newPassword = 'newPassword';
      campsi.on('auth/local/passwordResetTokenCreated', ({ user }) => {
        const passwordResetToken = user.identities.local.passwordResetToken.value;
        resetUserPassword(chai, campsi, glenda.username, passwordResetToken, newPassword).end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);

          signin(chai, campsi, glenda.username, firstPassword).end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(400);
            res.should.be.json;
            res.body.should.not.have.property('token');

            signin(chai, campsi, glenda.username, newPassword).end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.should.have.status(200);
              res.should.be.json;
              res.body.should.have.property('token');
              done();
            });
          });
        });
      });

      createUser(chai, campsi, glenda).then(() => {
        createResetPasswordToken(chai, campsi, glenda.email).end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('object');
        });
      });
    });
  });
});
