/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = '../config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const config = require('config');
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

describe('User Fetching', () => {
  let context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => context.server.close(done));
  describe('AuthService.fetchUsers', () => {
    it('it should return an array of user objects', done => {
      createUser(context.campsi, glenda).then(bearerToken => {
        chai
          .request(context.campsi.app)
          .get('/auth/me')
          .set('Authorization', 'Bearer ' + bearerToken)
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.a('object');
            res.body.identities.local.validated.should.eq(false);
            const glendaId = res.body._id;
            context.campsi.services
              .get('auth')
              .fetchUsers([glendaId])
              .then(users => {
                users.should.be.a('array');
                users.length.should.be.eq(1);
                users[0].should.be.a('object');
                users[0].email.should.eq(glenda.email);
                done();
              });
          });
      });
    });
  });
});
