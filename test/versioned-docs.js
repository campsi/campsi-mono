process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const debug = require('debug')('campsi:test');
const config = require('config');
const setupBeforeEach = require('./helpers/setupBeforeEach');
const createObjectId = require('../lib/modules/createObjectId');

chai.use(chaiHttp);
chai.should();

const services = {
  Auth: require('../services/auth/lib'),
  VersionedDocs: require('../services/versioned-docs/lib')
};

let current = {
  content: { title: 'Bonjour' },
  config: {},
  projectId: '61ee6b5693ccc2ba8d5ac6a1'
};
let revision = {
  content: { title: 'Bonjour' },
  config: { size: 100 },
  projectId: '61ee6b5693ccc2ba8d5ac6a1'
};

let version = {};

describe('VersionedDocs API', () => {
  let context = {};
  before(setupBeforeEach(config, services, context));
  after(() => context.server.close());

  describe('/POST documents', () => {
    it('it should return a newly created document', async () => {
      const res = await chai
        .request(context.campsi.app)
        .post('/versioneddocs/contracts')
        .send(current);
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.should.have.property('content');
      res.body.content.should.have.property('title');
      res.body.content.title.should.be.a('string').and.eq('Bonjour');
      current._id = createObjectId(res.body._id);
      current.revision = res.body.revision;
    });
  });
  describe('/POST invalid document', () => {
    it('it should return a validation error', async () => {
      const { content, ...incompleteDocPayload } = current;
      const res = await chai
        .request(context.campsi.app)
        .post('/versioneddocs/contracts')
        .send(incompleteDocPayload);
      res.should.have.status(500);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.should.have.property('message');
      res.body.message.should.be
        .a('string')
        .and.eq(" should have required property 'content'");
    });
  });
  describe('/GET all documents', () => {
    it('it should return an array of documents', async () => {
      const res = await chai
        .request(context.campsi.app)
        .get('/versioneddocs/contracts/');
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('array');
      res.body.length.should.be.eq(1);
      res.body[0]._id.should.be.equal(current._id.toString());
    });
  });
  describe('/GET a specific document', () => {
    it('it should return a document', async () => {
      const res = await chai
        .request(context.campsi.app)
        .get(`/versioneddocs/contracts/${current._id}`);
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body._id.should.be.equal(current._id.toString());
      try {
      } catch (e) {
        debug(`received an error from chai: ${e.message}`);
      }
    });
  });

  describe('/PATCH update a specific document', () => {
    it('it should return an updated document', async () => {
      const res = await chai
        .request(context.campsi.app)
        .patch(`/versioneddocs/contracts/${current._id}`)
        .set('If-Match', `revision-${current.revision}`)
        .send({ ...revision, revision: current.revision });
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body.should.have.property('config');
      res.body.config.should.have.property('size');
      res.body.config.size.should.be.eq(100);
      current = { ...res.body };
      current._id = createObjectId(res.body._id);
      try {
      } catch (e) {
        debug(`received an error from chai: ${e.message}`);
      }
    });
    it('it should return an error due to If-Match header missing', async () => {
      const res = await chai
        .request(context.campsi.app)
        .patch(`/versioneddocs/contracts/${current._id}`)
        .send({ ...revision, revision: current.revision });
      res.should.have.status(500);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body.should.have.property('message');
      res.body.message.should.be.eq('Missing If-Match header');
      try {
      } catch (e) {
        debug(`received an error from chai: ${e.message}`);
      }
    });
    it('it should return an error due to wrong If-Match header', async () => {
      const res = await chai
        .request(context.campsi.app)
        .patch(`/versioneddocs/contracts/${current._id}`)
        .set('If-Match', `revision-${current.revision + 1}`)
        .send({ ...revision, revision: current.revision });
      res.should.have.status(412);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body.should.have.property('message');
      res.body.message.should.be.eq(
        'Precondition Failed: ETag revision mismatch'
      );
      try {
      } catch (e) {
        debug(`received an error from chai: ${e.message}`);
      }
    });
  });

  describe('/GET all document revisions', () => {
    it('it should return an array of document revisions', async () => {
      const res = await chai
        .request(context.campsi.app)
        .get(`/versioneddocs/contracts/${current._id}/revisions/`);
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('array');
      res.body.length.should.be.eq(1);
      res.body[0].currentId.should.be.equal(current._id.toString());
      revision = { ...res.body[0] };
    });
  });

  describe('/GET a specific document revision', () => {
    it('it should return a document revision (by id)', async () => {
      const res = await chai
        .request(context.campsi.app)
        .get(
          `/versioneddocs/contracts/${current._id}/revisions/${revision._id}`
        );
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body._id.should.be.equal(revision._id.toString());
      res.body.currentId.should.be.equal(current._id.toString());
    });
    it('it should return a document revision (by revision number)', async () => {
      const res = await chai
        .request(context.campsi.app)
        .get(`/versioneddocs/contracts/${current._id}/revisions/1`);
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body._id.should.be.equal(revision._id.toString());
      res.body.currentId.should.be.equal(current._id.toString());
    });
    it('it should return an error for wrong revision query param', async () => {
      const res = await chai
        .request(context.campsi.app)
        .get(`/versioneddocs/contracts/${current._id}/revisions/whatever`);
      res.should.have.status(500);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body.should.have.property('message');
      res.body.message.should.be.equal('The revision you provided is invalid');
    });
  });

  describe('/POST set a revision as a new version', () => {
    it('it should create a version', async () => {
      const res = await chai
        .request(context.campsi.app)
        .post(
          `/versioneddocs/contracts/${current._id}/revisions/${revision._id}:set-as-version`
        );
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body.currentId.should.be.equal(current._id.toString());
      res.body.version.should.be.eq(1);
      res.body.should.have.property('publishedAt');
      version = { ...res.body };
      try {
      } catch (e) {
        debug(`received an error from chai: ${e.message}`);
      }
    });
  });

  describe('/GET all document versions', () => {
    it('it should return an array of document versions', async () => {
      const res = await chai
        .request(context.campsi.app)
        .get(`/versioneddocs/contracts/${current._id}/versions/`);
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('array');
      res.body.length.should.be.eq(1);
      res.body[0].currentId.should.be.equal(current._id.toString());
      res.body[0]._id.should.be.equal(version._id.toString());
    });
  });

  describe('/GET a specific version', () => {
    it('it should return a document version (by id)', async () => {
      const res = await chai
        .request(context.campsi.app)
        .get(`/versioneddocs/contracts/${current._id}/versions/${version._id}`);
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body._id.should.be.equal(version._id.toString());
      res.body.currentId.should.be.equal(current._id.toString());
    });
    it('it should return a document version (by version number)', async () => {
      const res = await chai
        .request(context.campsi.app)
        .get(`/versioneddocs/contracts/${current._id}/versions/1`);
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body._id.should.be.equal(version._id.toString());
      res.body.currentId.should.be.equal(current._id.toString());
    });
    it('it should return a document version (by tag)', async () => {
      const res = await chai
        .request(context.campsi.app)
        .get(
          `/versioneddocs/contracts/${current._id}/versions/?tag=${version.tag}`
        );
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body._id.should.be.equal(version._id.toString());
      res.body.currentId.should.be.equal(current._id.toString());
    });
    it('it should return an error for wrong version query param', async () => {
      const res = await chai
        .request(context.campsi.app)
        .get(`/versioneddocs/contracts/${current._id}/versions/whatever`);
      res.should.have.status(500);
      res.should.be.json;
      res.body.should.be.an('object');
      res.body.should.have.property('message');
      res.body.message.should.be.equal('The version you provided is invalid');
    });
  });

  describe('/DELETE a document and all its versions/revisions', () => {
    it('it should return an array of mongoDB DeleteResult', async () => {
      const res = await chai
        .request(context.campsi.app)
        .delete(`/versioneddocs/contracts/${current._id}`);
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.an('array');
      res.body.length.should.be.eq(3);
      res.body[0].deletedCount.should.be.equal(1);
    });
  });
});
