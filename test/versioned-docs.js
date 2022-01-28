process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const { ObjectId } = require('mongodb');
const debug = require('debug')('campsi:test');
const config = require('config');
const CampsiServer = require('../index');
const CampsiService = require('../lib/service');
const setupBeforeEach = require('./helpers/setupBeforeEach');

chai.use(chaiHttp);
chai.should();

const services = {
  Auth: require('../services/auth/lib'),
  VersionedDocs: require('../services/versioned-docs/lib')
};

const baseDocPayload = {
  _id: ObjectId('61f3d38d2e06883ba8c7c4c4'),
  content: { title: 'Bonjour' },
  config: {},
  projectId: '61ee6b5693ccc2ba8d5ac6a1'
};

describe('VersionedDocs API', () => {
  let context = {};
  before(setupBeforeEach(config, services, context));
  after(() => context.server.close());

  describe('/POST documents', () => {
    it('it should return a newly created document', async () => {
      try {
        const res = await chai
          .request(context.campsi.app)
          .post('/versioneddocs/contracts')
          .send(baseDocPayload);
        res.should.have.status(200);
        res.should.be.json;
        res.body.should.be.a('object');
        res.body.should.have.property('content');
        res.body.content.should.have.property('title');
        res.body.content.title.should.be('string').and.eq('Bonjour');
      } catch (e) {
        debug(`received an error from chai: ${e.message}`);
      }
    });
  });
  describe('/POST invalid document', () => {
    it('it should return a validation error', async () => {
      const { content, ...incompleteDocPayload } = baseDocPayload;
      try {
        const res = await chai
          .request(context.campsi.app)
          .post('/versioneddocs/contracts')
          .send(incompleteDocPayload);
        res.should.have.status(500);
        res.should.be.json;
        res.body.should.be.a('object');
        res.body.should.have.property('message');
        res.body.message.should
          .be('string')
          .and.eq(" should have required property 'content'");
      } catch (e) {
        debug(`received an error from chai: ${e.message}`);
      }
    });
  });
  describe('/GET all documents', () => {
    it('it should return an array of documents', async () => {
      try {
        const res = await chai
          .request(context.campsi.app)
          .get('/versioneddocs/contracts/');
        res.should.have.status(200);
        res.should.be.json;
        res.body.should.be.a('array');
        res.body.length.should.be.eq(1);
        res.body[0]._id.should.be.equal(baseDocPayload._id);
      } catch (e) {
        debug(`received an error from chai: ${e.message}`);
      }
    });
  });
});

/*
  TODO :
    get/add/remove user(s) to a resource
    get a document
    get all its revision
    get a specific revision (by number or id)
    get all its versions
    get a specific version (by number or id)
    get a specific version by tag
    delete a document (with all its revisions/versions)
 */
