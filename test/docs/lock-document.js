/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/docs/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const createUser = require('../helpers/createUser');
const setupBeforeEach = require('../helpers/setupBeforeEach');
const config = require('config');
let nownerToken;

chai.should();
format.extend(String.prototype);
chai.use(chaiHttp);

const owner = {
  displayName: 'Document Owner',
  email: 'owner@agilitation.fr',
  username: 'owner',
  password: 'signup!'
};

const nowner = {
  displayName: 'Document NOwner',
  email: 'nowner@agilitation.fr',
  username: 'nowner',
  password: 'signup!'
};

const services = {
  Auth: require('../../services/auth/lib'),
  Docs: require('../../services/docs/lib')
};

describe('locks', () => {
  const context = {};
  before(setupBeforeEach(config, services, context));

  after(done => {
    context.server.close(done);
  });

  describe('Document lock tests', () => {
    let userToken;
    let docId;

    it('it should return the created object', async () => {
      const campsi = context.campsi;

      const token = await createUser(chai, campsi, owner);

      userToken = token;
      let res = await chai
        .request(campsi.app)
        .post('/docs/pizzas')
        .set('Authorization', 'Bearer ' + token)
        .send({ name: 'renne' });

      docId = res.body.id;
      res = await chai
        .request(campsi.app)
        .post(`/docs/pizzas/${res.body.id}/locks/lock`)
        .set('Authorization', 'Bearer ' + token);

      res.should.have.status(200);
    });

    it('it should let us lock the document because we hold the original lock', async () => {
      const campsi = context.campsi;

      const res = await chai
        .request(campsi.app)
        .post(`/docs/pizzas/${docId}/locks/lock`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(200);
      res.should.be.json;
    });

    it('it should let us lock the document and set a short timeout', async () => {
      const campsi = context.campsi;

      const res = await chai
        .request(campsi.app)
        .post(`/docs/pizzas/${docId}/locks/lock?lockTimeout=1`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(200);
      res.should.be.json;
    });

    it('it should let us lock the document because the previous lock has expired', async () => {
      const campsi = context.campsi;

      nownerToken = await createUser(chai, campsi, nowner);

      // wait 1 second to let previous lock expire
      await new Promise(resolve => setTimeout(resolve, 1000));

      const res = await chai
        .request(campsi.app)
        .put(`/docs/pizzas/${docId}`)
        .set('Authorization', 'Bearer ' + nownerToken)
        .send({ name: '4 cheeses' });

      res.should.have.status(200);
    });

    it('it should lock the document because previous lock has expired', async () => {
      const campsi = context.campsi;

      const res = await chai
        .request(campsi.app)
        .post(`/docs/pizzas/${docId}/locks/lock`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(200);
    });

    it('it should not update the document because somone else holds the lock', async () => {
      const campsi = context.campsi;

      const res = await chai
        .request(campsi.app)
        .put(`/docs/pizzas/${docId}`)
        .set('Authorization', 'Bearer ' + nownerToken)
        .send({ name: '5 cheeses' });

      res.should.have.status(401);
    });
  });
});
