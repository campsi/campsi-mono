/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

const chai = require('chai');
const initialize = require('./utils/initialization');
const debug = require('debug')('campsi:test');
const config = require('config');
let { campsi, beforeEachCallback, afterEachCallback } = initialize(config, {docs: require('../lib/index')});

const users = {
  me: {_id: fakeId()},
  notMe: {_id: fakeId()},
  myFriend: {_id: fakeId()},
  friendButNotOwner: {_id: fakeId()}
};

// Helpers
function createEntry (data, owner, state) {
  return new Promise(function (resolve, reject) {
    let resource = campsi.services.get('docs').options.resources['simple'];
    builder.create({
      user: owner,
      data: data,
      resource: resource,
      state: state
    }).then((doc) => {
      resource.collection.insertOne(doc, (err, result) => {
        if (err) return reject(err);
        resolve(result.ops[0]._id);
      });
    }).catch((error) => {
      reject(error);
    });
  });
}

describe('Owner', () => {
  beforeEach(beforeEachCallback);
  afterEach(afterEachCallback);
  /*
   * Test owner role
   */
  describe('owner role', () => {
    it('it should create a doc with correct owner', (done) => {
      let data = {'name': 'test'};
      chai.request(campsi.app)
        .post('/docs/simple/state-private')
        .set('content-type', 'application/json')
        .send(data)
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.have.property('id');
          res.body.should.have.property('state');
          res.body.state.should.be.eq('state-private');
          res.body.should.have.property('id');
          res.body.should.have.property('createdAt');
          res.body.should.have.property('createdBy');
          expect(res.body.createdBy).to.be.eql(users.me._id);
          res.body.should.have.property('data');
          res.body.data.should.be.eql(data);
          done();
        });
    });
    it('it should not get a document not owned by current user', (done) => {
      let data = {'name': 'test'};
      createEntry(data, users.notMe, 'state-private').then((id) => {
        chai.request(campsi.app)
          .get('/docs/simple/{0}/state-private'.format(id))
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(404);
            res.should.be.json;
            res.body.should.be.an('object');
            res.body.should.have.property('message');
            done();
          });
      });
    });
    it('it should get a document owned by current user', (done) => {
      let data = {'name': 'test'};
      createEntry(data, users.me, 'state-private').then((id) => {
        chai.request(campsi.app)
          .get('/docs/simple/{0}/state-private'.format(id))
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.an('object');
            res.body.should.have.property('id');
            res.body.should.have.property('state');
            res.body.state.should.be.eq('state-private');
            res.body.should.have.property('createdAt');
            res.body.should.have.property('createdBy');
            res.body.createdBy.should.be.equal(users.me._id);
            res.body.should.have.property('data');
            res.body.data.should.be.eql(data);
            done();
          });
      });
    });
    it('it should return an empty array if not on the good state', (done) => {
      let data = {name: 'test'};
      createEntry(data, users.notMe, 'state-private').then(() => {
        chai.request(campsi.app)
          .get('/docs/simple')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.body.should.be.an('array');
            res.body.should.have.length(0);
            done();
          });
      });
    });
    it('it should return an empty array if current user have not created any document', (done) => {
      let data = {name: 'test'};
      createEntry(data, users.notMe, 'state-private').then(() => {
        chai.request(campsi.app)
          .get('/docs/simple?state=state-private')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.body.should.be.an('array');
            res.body.should.have.length(0);
            done();
          });
      });
    });
    it('it should not return an empty array if current user have created a document', (done) => {
      let data = {name: 'test'};
      createEntry(data, users.me, 'state-private').then(() => {
        chai.request(campsi.app)
          .get('/docs/simple?state=state-private')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.body.should.be.an('array');
            res.body.should.have.length(1);
            done();
          });
      });
    });
    it('it should return the list of users for a document', (done) => {
      let data = {name: 'test'};
      createEntry(data, users.me, 'state-private').then(docId => {
        chai.request(campsi.app)
          .get(`/docs/simple/${docId}/users`)
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.body.should.be.an('array');
            res.body.should.have.length(1);
            done();
          });
      });
    });
    it('is should add an owner to the document', (done) => {
      let data = {name: 'test'};
      createEntry(data, users.me, 'state-private').then(docId => {
        chai.request(campsi.app)
          .post(`/docs/simple/${docId}/users`)
          .send({userId: users.myFriend._id, roles: ['owner']})
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.body.should.be.an('object');
            res.body.should.have.property('roles');
            // Add the "not-owner" user
            chai.request(campsi.app)
              .post(`/docs/simple/${docId}/users`)
              .send({userId: users.friendButNotOwner._id, roles: ['editor']})
              .end(() => {
                chai.request(campsi.app).get(`/docs/simple/${docId}/users`)
                  .end((err, res) => {
                    if (err) debug(`received an error from chai: ${err.message}`);
                    res.body.should.be.an('array');
                    res.body.should.have.length(3);
                    done();
                  });
              });
          });
      });
    });
  });
});
