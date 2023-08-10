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
const { ObjectId } = require('mongodb');
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

const admin = {
  email: 'admin@campsi.io',
  username: 'admin@campsi.io',
  displayName: 'admin',
  password: 'password'
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

  let adminToken;
  let userToken;
  let campsi;
  before(
    setupBeforeEach(config, services, context, async () => {
      campsi = context.campsi;

      adminToken = await createUser(chai, campsi, admin, true);
      await campsi.db
        .collection('__users__')
        .findOneAndUpdate({ email: admin.email }, { $set: { isAdmin: true } }, { returnDocument: 'after' });

      userToken = await createUser(chai, campsi, owner);
      nownerToken = await createUser(chai, campsi, nowner);
    })
  );

  after(done => {
    context.server.close(done);
  });

  describe('Document lock tests', async () => {
    let docId;
    let privateDocId;
    let lockId;

    it('it should return the created object', async () => {
      let res = await chai
        .request(campsi.app)
        .post('/docs/pizzas')
        .set('Authorization', 'Bearer ' + userToken)
        .send({ name: 'renne' });

      docId = res.body.id;
      res = await chai
        .request(campsi.app)
        .post(`/docs/pizzas/${docId}/locks`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(200);
    });

    it('it should let us lock the document because we hold the original lock', async () => {
      const res = await chai
        .request(campsi.app)
        .post(`/docs/pizzas/${docId}/locks`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(200);
      res.should.be.json;
    });

    it('it should let us lock the document and set a short timeout', async () => {
      const res = await chai
        .request(campsi.app)
        .post(`/docs/pizzas/${docId}/locks?lockTimeout=1`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(200);
      res.should.be.json;
    });

    it('it should let us lock the document because the previous lock has expired', async () => {
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
      const res = await chai
        .request(campsi.app)
        .post(`/docs/pizzas/${docId}/locks`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(200);
    });

    it('it should not update the document because somone else holds the lock', async () => {
      const res = await chai
        .request(campsi.app)
        .put(`/docs/pizzas/${docId}`)
        .set('Authorization', 'Bearer ' + nownerToken)
        .send({ name: '5 cheeses' });

      res.should.have.status(401);
    });

    it('it should let us create a working draft pizza doc', async () => {
      const res = await chai
        .request(campsi.app)
        .post('/docs/pizzas/working_draft')
        .set('Authorization', 'Bearer ' + nownerToken)
        .send({ name: '6 cheeses' });

      res.should.have.status(200);

      privateDocId = res.body.id;
    });

    it('it should let us update the working_draft pizza', async () => {
      const res = await chai
        .request(campsi.app)
        .put(`/docs/pizzas/${privateDocId}/working_draft`)
        .set('Authorization', 'Bearer ' + nownerToken)
        .send({ name: '7 cheeses' });

      res.should.have.status(200);
    });

    it('it should let us lock the working_draft pizza', async () => {
      const res = await chai
        .request(campsi.app)
        .post(`/docs/pizzas/${privateDocId}/working_draft/locks`)
        .set('Authorization', 'Bearer ' + nownerToken);

      res.should.have.status(200);
    });

    it('it should let us update the locked the working_draft pizza', async () => {
      const res = await chai
        .request(campsi.app)
        .put(`/docs/pizzas/${privateDocId}/working_draft`)
        .set('Authorization', 'Bearer ' + nownerToken)
        .send({ name: '8 cheeses' });

      res.should.have.status(200);
    });

    it('it should block us from updating the locked the working_draft pizza', async () => {
      const res = await chai
        .request(campsi.app)
        .put(`/docs/pizzas/${privateDocId}/working_draft`)
        .set('Authorization', 'Bearer ' + userToken)
        .send({ name: '9 cheeses' });

      res.should.have.status(401);
    });

    // [roro] I don't understand the purpose of this test. It never worked and I don't see why it should: there's no "published" state of the document at this point, and the state "working_draft" is actually already locked
    /* it('it should let us modify the public version', async () => {
      const res = await chai
        .request(campsi.app)
        .put(`/docs/pizzas/${privateDocId}`)
        .set('Authorization', 'Bearer ' + userToken)
        .send({ name: '9 cheeses' });

      res.should.have.status(200);
    }); */

    it('it should let us lock the public version', async () => {
      const res = await chai
        .request(campsi.app)
        .post(`/docs/pizzas/${privateDocId}/locks`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(200);
    });

    it('it should list the locks on the doc with published state', async () => {
      const match = { [`tokens.${userToken}`]: { $exists: true } };
      const user = await campsi.db.collection('__users__').findOne(match);

      const res = await chai
        .request(campsi.app)
        .get(`/docs/pizzas/${docId}/locks`)
        .set('Authorization', 'Bearer ' + adminToken);

      const userId = new ObjectId(user._id).toString();
      res.body[0].published.userId.should.eq(userId);
    });

    it('it should list the locks on doc with working_draft state', async () => {
      try {
        let match = { [`tokens.${nownerToken}`]: { $exists: true } };
        const noOwnerUser = await campsi.db.collection('__users__').findOne(match);

        match = { [`tokens.${userToken}`]: { $exists: true } };
        const user = await campsi.db.collection('__users__').findOne(match);

        const res = await chai
          .request(campsi.app)
          .get(`/docs/pizzas/${privateDocId}/locks`)
          .set('Authorization', 'Bearer ' + adminToken);

        res.should.have.status(200);

        const userId = new ObjectId(user._id).toString();
        const noOwnerUserId = new ObjectId(noOwnerUser._id).toString();
        res.body[0].working_draft.userId.should.eq(noOwnerUserId);
        res.body[1].published.userId.should.eq(userId);
      } catch (err) {
        err.should.be.null();
      }
    });

    it('it should not let me list the locks because I am not authorized', async () => {
      const res = await chai
        .request(campsi.app)
        .get(`/docs/pizzas/${privateDocId}/locks`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(401);
    });

    it('it should let me delete a lock', async () => {
      let res = await chai
        .request(campsi.app)
        .get(`/docs/pizzas/${docId}/locks`)
        .set('Authorization', 'Bearer ' + adminToken);

      lockId = res.body[0]._id;

      res = await chai
        .request(campsi.app)
        .delete(`/docs/pizzas/${docId}/locks/${lockId}`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(200);
    });

    it('it should return not found when deleteing a deleted lock', async () => {
      const res = await chai
        .request(campsi.app)
        .delete(`/docs/pizzas/${docId}/locks/${lockId}`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(404);
    });

    it('it should return not authorised when I try to delete a lock belonging to someone else', async () => {
      // this test works because the user that owns the first lock on this document is noOwnerUser
      let res = await chai
        .request(campsi.app)
        .get(`/docs/pizzas/${privateDocId}/locks`)
        .set('Authorization', 'Bearer ' + adminToken);

      lockId = res.body[0]._id;

      res = await chai
        .request(campsi.app)
        .delete(`/docs/pizzas/${privateDocId}/locks/${lockId}`)
        .set('Authorization', 'Bearer ' + userToken);

      res.should.have.status(401);
    });

    it('it should let me delete a lock belonging to someone else if I am an admin user', async () => {
      // this test works because the user that owns the first lock on this document is noOwnerUser
      let res = await chai
        .request(campsi.app)
        .get(`/docs/pizzas/${privateDocId}/locks`)
        .set('Authorization', 'Bearer ' + adminToken);

      let lockOwner;

      for (const value of Object.values(res.body[0])) {
        if (value?.userId) {
          lockOwner = value.userId;
          break;
        }
      }

      lockId = res.body[0]._id;

      await campsi.db
        .collection('__users__')
        .findOneAndUpdate({ email: admin.email }, { $set: { isAdmin: true } }, { returnDocument: 'after' });

      try {
        res = await chai
          .request(campsi.app)
          .delete(`/docs/pizzas/${privateDocId}/locks/${lockId}?surrogateId=${lockOwner}`)
          .set('Authorization', 'Bearer ' + userToken);
      } catch (ex) {
        console.log(ex);
      }

      res.should.have.status(401);
    });

    it('it should let me delete a lock belonging to someone else if I am an admin user', async () => {
      // this test works because the user that owns the first lock on this document is noOwnerUser
      let res = await chai
        .request(campsi.app)
        .get(`/docs/pizzas/${privateDocId}/locks`)
        .set('Authorization', 'Bearer ' + adminToken);

      let lockOwner;

      for (const value of Object.values(res.body[0])) {
        if (value?.userId) {
          lockOwner = value.userId;
          break;
        }
      }

      lockId = res.body[0]._id;

      await campsi.db
        .collection('__users__')
        .findOneAndUpdate({ email: admin.email }, { $set: { isAdmin: true } }, { returnDocument: 'after' });

      try {
        res = await chai
          .request(campsi.app)
          .delete(`/docs/pizzas/${privateDocId}/locks/${lockId}?surrogateId=${lockOwner}`)
          .set('Authorization', 'Bearer ' + adminToken);
      } catch (ex) {
        console.log(ex);
      }

      res.should.have.status(200);
    });
  });
});
