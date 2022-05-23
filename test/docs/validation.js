/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/docs/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies

const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const createUser = require('../helpers/createUser');
const setupBeforeEach = require('../helpers/setupBeforeEach');
const config = require('config');

chai.should();
format.extend(String.prototype);
chai.use(chaiHttp);

const owner = {
  displayName: 'Document Owner',
  email: 'owner@agilitation.fr',
  username: 'owner',
  password: 'signup!'
};

const services = {
  Auth: require('../../services/auth/lib'),
  Docs: require('../../services/docs/lib')
};

describe('Validation', () => {
  const context = {};
  beforeEach(setupBeforeEach(config, services, context));

  afterEach(done => {
    context.server.close(done);
  });

  describe('Create a well-formed document', () => {
    it('it should return something', done => {
      const campsi = context.campsi;
      createUser(chai, campsi, owner).then(token => {
        chai
          .request(campsi.app)
          .post('/docs/pizzas')
          .set('Authorization', 'Bearer ' + token)
          .send({ name: 'renne' })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.an('object');
            res.body.should.have.a.property('data').that.is.an('object');
            res.body.data.should.have.a.property('name').that.is.a('string');
            res.body.data.name.should.eq('renne');
            done();
          });
      });
    });
  });

  describe('Create a malformed document', () => {
    it('it should return something', done => {
      const campsi = context.campsi;
      createUser(chai, campsi, owner).then(token => {
        chai
          .request(campsi.app)
          .post('/docs/pizzas')
          .set('Authorization', 'Bearer ' + token)
          .send({ title: 'renne' })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            console.dir(res.body);
            res.should.have.status(400);
            res.should.be.json;
            res.body.should.be.an('object');
            res.body.should.have.a.property('message').that.is.a('string');
            res.body.message.should.eq('Validation Error');
            done();
          });
      });
    });
  });
});
