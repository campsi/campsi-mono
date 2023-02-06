/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const config = require('config');
const setupBeforeEach = require('../helpers/setupBeforeEach');
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

describe('Auth Local API', async () => {
  const context = {};
  beforeEach(async () => await setupBeforeEach(config, services, context));
  afterEach(async () => await context.server.close());

  describe('/PUT docs as a user', async () => {
    it('it should create 2 users and try to update a doc and get the correct status code', async () => {
      try {
        const campsi = context.campsi;
        await createUser(campsi, glenda);

        let res = await chai.request(campsi.app).post('/auth/local/signin').set('content-type', 'application/json').send({
          username: 'Glenda@agilitation.fr',
          password: 'signup!'
        });

        const token = res.body.token;

        res = await chai
          .request(campsi.app)
          .post('/docs/opening_hours')
          .set('content-type', 'application/json')
          .set('Authorization', 'Bearer ' + token)
          .send({ name: 'test doc' });

        let id = res.body.id;

        await createUser(campsi, glenda2);
        res = await chai.request(campsi.app).post('/auth/local/signin').set('content-type', 'application/json').send({
          username: 'Glenda2@agilitation.fr',
          password: 'signup!'
        });

        const token2 = res.body.token;
        res = await chai
          .request(campsi.app)
          .put(`/docs/opening_hours/${id}`)
          .set('content-type', 'application/json')
          .set('Authorization', 'Bearer ' + token2)
          .send({ name: 'test modified' });

        res.should.have.status(401);

        res = await chai
          .request(campsi.app)
          .put(`/docs/opening_hours/${id}`)
          .set('content-type', 'application/json')
          .set('Authorization', 'Bearer ' + token)
          .send({ name: 'test modified' });

        res.should.have.status(200);

        id = new ObjectId().toHexString();

        res = await chai
          .request(campsi.app)
          .put(`/docs/opening_hours/${id.toString()}`)
          .set('content-type', 'application/json')
          .set('Authorization', 'Bearer ' + token2)
          .send({ name: 'test modified' });
        res.should.have.status(404);
      } catch (err) {
        console.log(err);
      }
    });
  });
});
