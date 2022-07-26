/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const config = require('config');
const setupBeforeEach = require('../helpers/setupBeforeEach');
const createObjectId = require('../../lib/modules/createObjectId');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

chai.use(chaiHttp);
chai.use(sinonChai);
chai.should();

const services = {
  Notifications: require('../../services/notifications')
};

describe('Notification CRUD', () => {
  const context = {};
  before(setupBeforeEach(config, services, context));
  after(async () => {
    await context.campsi.services.get('notifications').db.collection('notifications.notifications').deleteMany();
    await context.server.close();
  });

  describe('GET /', () => {
    before(async () => {
      await context.campsi.services
        .get('notifications')
        .db.collection('notifications.notifications')
        .insertMany([
          {
            createdAt: new Date('2022-06-29'),
            createdBy: null,
            modifiedAt: new Date('2022-06-30'),
            modifiedBy: null,
            data: {
              attr1: true,
              attr2: 'string'
            }
          },
          {
            createdAt: new Date('2022-07-22'),
            createdBy: null,
            modifiedAt: null,
            modifiedBy: null,
            data: {
              attr1: false,
              attr2: 'azerty'
            }
          }
        ]);
    });

    after(async () => {
      await context.campsi.services.get('notifications').db.collection('notifications.notifications').deleteMany();
    });

    it('should GET all notifications', async () => {
      const res = await chai.request(context.campsi.app).get('/notifications/notifications');
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.success.should.be.eq(true);
      res.body.notifications.should.be.a('array');
      res.body.notifications.length.should.be.eq(2);
    });
  });

  describe('GET /:id', () => {
    before(async () => {
      await context.campsi.services
        .get('notifications')
        .db.collection('notifications.notifications')
        .insertMany([
          {
            _id: createObjectId('62da6d6944273d3f648d3633'),
            createdAt: new Date('2022-06-29'),
            createdBy: null,
            modifiedAt: new Date('2022-06-30'),
            modifiedBy: null,
            data: {
              attr1: true,
              attr2: 'string'
            }
          },
          {
            _id: createObjectId('62da6d78181fd43fd38ddf4e'),
            createdAt: new Date('2022-07-22'),
            createdBy: null,
            modifiedAt: null,
            modifiedBy: null,
            data: {
              attr1: false,
              attr2: 'azerty'
            }
          }
        ]);
    });

    after(async () => {
      await context.campsi.services.get('notifications').db.collection('notifications.notifications').deleteMany();
    });

    it('should GET the notification with id "62da6d78181fd43fd38ddf4e"', async () => {
      const res = await chai.request(context.campsi.app).get('/notifications/notifications/62da6d78181fd43fd38ddf4e');
      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.success.should.be.eq(true);
      res.body.notification.should.be.a('object');
      res.body.notification._id.should.be.eq('62da6d78181fd43fd38ddf4e');
    });

    it('should return a 404 error with id "62dfb51303b0b916370d8439"', async () => {
      const res = await chai.request(context.campsi.app).get('/notifications/notifications/62dfb51303b0b916370d8439');

      res.should.have.status(404);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.message.should.be.eq('not found');
    });
  });

  describe('POST /', () => {
    after(async () => {
      await context.campsi.services.get('notifications').db.collection('notifications.notifications').deleteMany();
    });

    it('should CREATE a new notification', async () => {
      const res = await chai.request(context.campsi.app).post('/notifications/notifications').send({
        attr1: true,
        attr2: 'string'
      });

      const createdNotification = await context.campsi.services
        .get('notifications')
        .db.collection('notifications.notifications')
        .findOne({ _id: createObjectId(res.body._id) });

      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.success.should.be.eq(true);
      res.body._id.should.be.a('string');

      chai.expect(createdNotification).should.not.be.null;
    });

    it('should EMIT when a new notification is created', async () => {
      const sandbox = sinon.createSandbox();

      sandbox.spy(context.campsi.services.get('notifications'), 'emit');

      await chai.request(context.campsi.app).post('/notifications/notifications').send({
        attr1: true,
        attr2: 'string'
      });

      chai.expect(context.campsi.services.get('notifications').emit.calledOnce).to.be.true;

      sandbox.restore();
    });
  });

  describe('PUT /:id', () => {
    before(async () => {
      await await context.campsi.services
        .get('notifications')
        .db.collection('notifications.notifications')
        .insertMany([
          {
            _id: createObjectId('62da6d6944273d3f648d3633'),
            createdAt: new Date('2022-06-29'),
            createdBy: null,
            modifiedAt: new Date('2022-06-30'),
            modifiedBy: null,
            data: {
              attr1: true,
              attr2: 'string'
            }
          },
          {
            _id: createObjectId('62da6d78181fd43fd38ddf4e'),
            createdAt: new Date('2022-07-22'),
            createdBy: null,
            modifiedAt: null,
            modifiedBy: null,
            data: {
              attr1: false,
              attr2: 'azerty'
            }
          }
        ]);
    });

    after(async () => {
      await context.campsi.services.get('notifications').db.collection('notifications.notifications').deleteMany();
    });

    it('should UPDATE a notification', async () => {
      const res = await chai.request(context.campsi.app).put('/notifications/notifications/62da6d78181fd43fd38ddf4e').send({
        key1: true,
        key2: 'string'
      });

      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.success.should.be.eq(true);
      res.body.notification.should.be.a('object');
      res.body.notification.data.key1.should.be.eq(true);
      res.body.notification.data.key2.should.be.eq('string');
      res.body.notification.modifiedAt.should.be.not.null;
    });

    it('should return a 404 error with id "62dfb51303b0b916370d8439"', async () => {
      const res = await chai.request(context.campsi.app).put('/notifications/notifications/62dfb51303b0b916370d8439');

      res.should.have.status(404);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.message.should.be.eq('not found');
    });

    it('should EMIT when a notification is updated', async () => {
      const sandbox = sinon.createSandbox();

      sandbox.spy(context.campsi.services.get('notifications'), 'emit');

      await chai.request(context.campsi.app).put('/notifications/notifications/62da6d78181fd43fd38ddf4e').send({
        key1: true,
        key2: 'string'
      });

      chai.expect(context.campsi.services.get('notifications').emit.calledOnce).to.be.true;

      sandbox.restore();
    });
  });

  describe('PATCH /:id', () => {
    before(async () => {
      await context.campsi.services
        .get('notifications')
        .db.collection('notifications.notifications')
        .insertMany([
          {
            _id: createObjectId('62da6d6944273d3f648d3633'),
            createdAt: new Date('2022-06-29'),
            createdBy: null,
            modifiedAt: new Date('2022-06-30'),
            modifiedBy: null,
            data: {
              attr1: true,
              attr2: 'string'
            }
          },
          {
            _id: createObjectId('62da6d78181fd43fd38ddf4e'),
            createdAt: new Date('2022-07-22'),
            createdBy: null,
            modifiedAt: null,
            modifiedBy: null,
            data: {
              attr1: false,
              attr2: 'azerty',
              attr3: 'azerty'
            }
          }
        ]);
    });

    after(async () => {
      await context.campsi.services.get('notifications').db.collection('notifications.notifications').deleteMany();
    });

    it('should PATCH a notification', async () => {
      const res = await chai.request(context.campsi.app).patch('/notifications/notifications/62da6d78181fd43fd38ddf4e').send({
        key1: true,
        attr1: 'string',
        attr3: null
      });

      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.success.should.be.eq(true);
      res.body.notification.should.be.a('object');
      res.body.notification.data.key1.should.be.eq(true);
      res.body.notification.data.attr1.should.be.eq('string');
      res.body.notification.data.attr2.should.be.eq('azerty');
      res.body.notification.modifiedAt.should.be.not.null;
      chai.expect(res.body.notification.data.attr3).to.be.undefined;
    });

    it('should return a 404 error with id "62dfb51303b0b916370d8439"', async () => {
      const res = await chai.request(context.campsi.app).patch('/notifications/notifications/62dfb51303b0b916370d8439');

      res.should.have.status(404);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.message.should.be.eq('not found');
    });

    it('should EMIT when a notification is patched', async () => {
      const sandbox = sinon.createSandbox();

      sandbox.spy(context.campsi.services.get('notifications'), 'emit');

      await chai.request(context.campsi.app).patch('/notifications/notifications/62da6d78181fd43fd38ddf4e').send({
        key1: true,
        attr1: 'string',
        attr3: null
      });

      chai.expect(context.campsi.services.get('notifications').emit.calledOnce).to.be.true;

      sandbox.restore();
    });
  });

  describe('DELETE /:id', () => {
    beforeEach(async () => {
      await context.campsi.services
        .get('notifications')
        .db.collection('notifications.notifications')
        .insertMany([
          {
            _id: createObjectId('62da6d6944273d3f648d3633'),
            createdAt: new Date('2022-06-29'),
            createdBy: null,
            modifiedAt: new Date('2022-06-30'),
            modifiedBy: null,
            data: {
              attr1: true,
              attr2: 'string'
            }
          },
          {
            _id: createObjectId('62da6d78181fd43fd38ddf4e'),
            createdAt: new Date('2022-07-22'),
            createdBy: null,
            modifiedAt: null,
            modifiedBy: null,
            data: {
              attr1: false,
              attr2: 'azerty',
              attr3: 'azerty'
            }
          }
        ]);
    });

    afterEach(async () => {
      await context.campsi.services.get('notifications').db.collection('notifications.notifications').deleteMany();
    });

    it('should DELETE a notification', async () => {
      const res = await chai.request(context.campsi.app).delete('/notifications/notifications/62da6d78181fd43fd38ddf4e');

      const allNotifications = await context.campsi.services
        .get('notifications')
        .db.collection('notifications.notifications')
        .find()
        .toArray();

      res.should.have.status(200);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.success.should.be.eq(true);
      chai.expect(allNotifications.length).to.be.eq(1);
    });

    it('should return a 404 error with id "62dfb51303b0b916370d8439"', async () => {
      const res = await chai.request(context.campsi.app).delete('/notifications/notifications/62dfb51303b0b916370d8439');

      res.should.have.status(404);
      res.should.be.json;
      res.body.should.be.a('object');
      res.body.message.should.be.eq('not found');
    });

    it('should EMIT when a notification is deleted', async () => {
      const sandbox = sinon.createSandbox();

      sandbox.spy(context.campsi.services.get('notifications'), 'emit');

      await chai.request(context.campsi.app).delete('/notifications/notifications/62da6d78181fd43fd38ddf4e');

      chai.expect(context.campsi.services.get('notifications').emit.calledOnce).to.be.true;

      sandbox.restore();
    });
  });
});
