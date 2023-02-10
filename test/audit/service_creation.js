/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

const { expect } = require('chai');
// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const config = require('config');
const fakeObjectId = require('fake-object-id');
const { ObjectId } = require('mongodb');
const setupBeforeEach = require('../helpers/setupBeforeEach');
chai.use(chaiHttp);
chai.should();

const services = {
  Audit: require('../../services/audit'),
  Docs: require('../../services/docs/lib')
};

describe('Audit Service', () => {
  const context = {};
  before(setupBeforeEach(config, services, context));
  after(done => {
    context.server.close(done);
  });

  /**
   * Test the journal creation
   */
  describe('/POST', () => {
    it('should create a journal entry via a REST call', async () => {
      const entry = {
        action: 'CREATE',
        data: {
          id: fakeObjectId()
        },
        user: fakeObjectId(),
        date: new Date().toISOString()
      };

      const res = await chai.request(context.campsi.app).post('/audit/log').set('content-type', 'application/json').send(entry);

      res.should.have.status(200);
      res.should.be.json;

      // check it is in the db
      const logEntry = await context.campsi.db.collection('audit').findOne({ user: ObjectId(entry.user) });

      const theSame = logEntry.user.equals(ObjectId(entry.user));

      theSame.should.be.true;
    });

    it('should fail to create a journal entry via a REST call', async () => {
      const res = await chai.request(context.campsi.app).post('/audit/log').set('content-type', 'application/json');

      res.should.have.status(400);
    });
  });

  describe('/GET route', () => {
    it('should retrieve a journal entry via a REST CALL', async () => {
      const startDate = new Date();
      const endDate = new Date();

      startDate.setSeconds(startDate.getSeconds() - 10);
      endDate.setSeconds(endDate.getSeconds() + 10);

      const res = await chai
        .request(context.campsi.app)
        .get(`/audit/log/?startDate=${startDate.toUTCString()}&endDate=${endDate.toUTCString()}`)
        .set('content-type', 'application/json');

      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.a('object');
    });

    it('should retrieve no journal entries via a REST CALL', async () => {
      const startDate = new Date('2022-01-01');
      const endDate = new Date('2022-02-01');

      startDate.setSeconds(startDate.getSeconds() - 10);
      endDate.setSeconds(endDate.getSeconds() + 10);

      const res = await chai
        .request(context.campsi.app)
        .get(`/audit/log/?startDate=${startDate.toUTCString()}&endDate=${endDate.toUTCString()}`)
        .set('content-type', 'application/json');

      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.empty;
    });
  });

  describe('Test direct library usage', () => {
    it('should create a journal entry via the audit lib', async () => {
      const entry = {
        action: 'CREATE',
        data: {
          name: 'james'
        },
        user: fakeObjectId(),
        date: new Date().toISOString()
      };

      const auditService = context.campsi.services.get('audit');

      await auditService.createLog(entry);

      // check it is in the db
      const logEntry = await context.campsi.db.collection('audit').findOne({ user: ObjectId(entry.user) });

      const theSame = logEntry.user.equals(ObjectId(entry.user));

      theSame.should.be.true;
    });

    it('should fail to create a journal entry via the audit lib (missing action)', async () => {
      const entry = {
        data: {
          name: 'james'
        },
        user: fakeObjectId(),
        date: new Date().toISOString()
      };

      const auditService = context.campsi.services.get('audit');

      const id = await auditService.createLog(entry);

      expect(id).to.be.undefined;
    });
  });
});
