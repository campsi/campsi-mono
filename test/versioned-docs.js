process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');

const debug = require('debug')('campsi:test');
const setupBeforeEach = require('./helpers/setupBeforeEach');
const CampsiServer = require('../index');
const CampsiService = require('../lib/service');
const config = require('config');

chai.use(chaiHttp);
chai.should();

const services = {
  Auth: require('../services/auth/lib'),
  VersionedDocs: require('../services/versioned-docs/lib')
};

const baseDocPayload = {
  content: { title: 'Bonjour' },
  config: {},
  projectId: '61ee6b5693ccc2ba8d5ac6a1'
};

describe('VersionedDocs API', () => {
  let context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => {
    context.campsi.dbClient.close();
    context.server.close(done);
  });
  describe('/POST documents', () => {
    it('it should return a newly created document', done => {
      chai
        .request(context.campsi.app)
        .post('/versioneddocs/contracts')
        .send(baseDocPayload)
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.an('object');
          res.body.should.have.property('content');
          res.body.content.should.have.property('title');
          res.body.content.title.should.be.a('string');
          res.body.content.title.should.be.eq('Bonjour');
          done();
        });
    });
  });
});

/*
  TODO :
    create doc
    get all documents of a resource
    get/add/remove user(s) to a resource
    get a document
    get all its revision
    get a specific revision (by number or id)
    get all its versions
    get a specific version (by number or id)
    get a specific version by tag
    delete a document (with all its revisions/versions)
 */
