/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/docs/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const config = require('config');
const { ObjectId, ObjectID } = require('mongodb');
const setupBeforeEach = require('../helpers/setupBeforeEach');
const createUser = require('../helpers/createUser');

chai.should();
const expect = chai.expect;
format.extend(String.prototype);
chai.use(chaiHttp);

const services = {
  Auth: require('../../services/auth/lib'),
  Docs: require('../../services/docs/lib')
};

const createProject = function (id) {
  return {
    _id: new ObjectID(),
    users: {
      [id]: {
        roles: ['owner'],
        addedAt: new Date(),
        userId: id,
        displayName: 'James Lotery',
        infos: ''
      }
    },
    states: {
      published: {
        createdAt: new Date(),
        createdBy: new ObjectId(),
        data: {},
        modifiedAt: new Date(),
        modifiedBy: new ObjectID()
      }
    }
  };
};

const glenda = {
  displayName: 'Glenda Bennett',
  email: 'glenda@agilitation.fr',
  username: 'glenda',
  password: 'signup!',
  picture:
    // eslint-disable-next-line max-len
    'https://images.unsplash.com/photo-1536995769641-12e9f98fd223?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=687&q=80',
  data: {
    somedata: 'this is some data',
    somemoredata: 'this is some more data'
  }
};

// Our parent block
describe('Owner', () => {
  const context = {};
  beforeEach(setupBeforeEach(config, services, context));

  afterEach(done => {
    context.server.close(done);
  });

  describe('delete a user', () => {
    it('should delete an existing user', async () => {
      const campsi = context.campsi;
      const admin = {
        email: 'admin@campsi.io',
        username: 'admin@campsi.io',
        displayName: 'admin',
        password: 'password'
      };

      const adminToken = await createUser(chai, campsi, admin, true);

      await campsi.db
        .collection('__users__')
        .findOneAndUpdate({ email: admin.email }, { $set: { isAdmin: true } }, { returnDocument: 'after' });

      await createUser(chai, campsi, glenda);

      let res = await chai
        .request(campsi.app)
        .get('/auth/users')
        .set('Authorization', 'Bearer ' + adminToken);

      res.should.have.status(200);

      // glenda
      const userId = res.body.filter(u => u.email === glenda.email)[0]._id;
      const project = createProject(userId);

      // insert fake __users__.user project with userId.displayName contaiting a filled in name
      let result = await campsi.db.collection('__users__').insertOne(project);

      // anonymize the user
      res = await chai
        .request(campsi.app)
        .delete(`/auth/users/${userId}:soft-delete`)
        .set('Authorization', `Bearer ${adminToken}`);

      const body = res.body;
      res.should.have.status(200);
      body.email.should.be.empty;
      body.displayName.should.be.empty;
      body.picture.should.be.empty;
      expect(new Date(body.deletedAt).getTime()).to.be.closeTo(Date.now(), 1000);
      Object.keys(body.data).length.should.be.equal(0);
      Object.keys(body.identities).length.should.be.equal(0);

      // anonymize what we know is in docs as well
      const collection = '__users__';

      // eslint-disable-next-line no-template-curly-in-string
      const update = "{ [ `users.${userId}.displayName`]: { $exists: true } }, { $set: { [ `users.${userId}.displayName`]: ''} }";

      await chai
        .request(campsi.app)
        .delete('/docs/none:soft-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('content-type', 'application/json')
        .send({
          update,
          collection
        });

      // make sure the extra field has been cleared out
      result = await campsi.db.collection('__users__').findOne(project._id);

      // test that the displayName has been anonymized
      expect(result.users[`${userId}`].displayName).to.be.empty;

      // try and delete it again - should fail
      res = await chai
        .request(campsi.app)
        .delete(`/auth/users/${userId}:soft-delete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('content-type', 'application/json');
      res.should.have.status(404);
    });
  });
});
