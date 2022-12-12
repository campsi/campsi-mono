/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const config = require('config');
const setupBeforeEach = require('../helpers/setupBeforeEach');
chai.use(chaiHttp);
chai.should();

const services = {
  Billing: require('../../services/stripe-billing/lib')
};

describe('Stripe Billing Service', () => {
  const context = {};
  before(setupBeforeEach(config, services, context));
  after(done => {
    context.server.close(done);
  });

  /**
   * Test the journal creation
   */
  describe('direct service method calls', () => {
    it('should reject the email address', async () => {
      let emailOK;

      const billingService = context.campsi.services.get('billing');
      const badEmail = 'jlotery@hotmail';

      try {
        await billingService.checkEmailValidity(badEmail);
        emailOK = true;
      } catch (ex) {
        emailOK = false;
      }

      emailOK.should.be.false;
    });

    it('should reject the email address', async () => {
      let emailOK;

      const billingService = context.campsi.services.get('billing');
      const badEmail = 'jlotery';

      try {
        await billingService.checkEmailValidity(badEmail);
        emailOK = true;
      } catch (ex) {
        emailOK = false;
      }

      emailOK.should.be.false;
    });

    it('should reject the email address', async () => {
      let emailOK;

      const billingService = context.campsi.services.get('billing');
      const badEmail = { email: 'jlotery@' };

      try {
        await billingService.checkEmailValidity(badEmail);
        emailOK = true;
      } catch (ex) {
        emailOK = false;
      }

      emailOK.should.be.false;
    });

    it('should reject the email address', async () => {
      let emailOK;

      const billingService = context.campsi.services.get('billing');
      const badEmail = 'jlotery@hotmail.';

      try {
        await billingService.checkEmailValidity(badEmail);
        emailOK = true;
      } catch (ex) {
        emailOK = false;
      }

      emailOK.should.be.false;
    });

    it('should accept the email address', async () => {
      let emailOK;

      const billingService = context.campsi.services.get('billing');
      const goodEmail = 'jlotery@hotmail.com';

      try {
        await billingService.checkEmailValidity(goodEmail);
        emailOK = true;
      } catch (ex) {
        emailOK = false;
      }

      emailOK.should.be.true;
    });
  });
  describe('/POST', () => {
    const payload = {
      email: 'jlotery@hotmail.com',
      description: 'Quonference SASU',
      name: 'Quonference SASU',
      tax_exempt: 'none',
      metadata: {
        contactName: 'James Lotery',
        isProfessional: 'YES',
        projectId: '635b9335129af11d35a4b8ad',
        userId: '62bda10a647de869e67c973e'
      },
      preferred_locales: ['en-US', 'en-EN', 'en', 'fr-FR'],
      expand: 'sources|default_source|tax_ids',
      address: {
        line1: '1 here',
        city: 'Montpellier',
        country: 'FR',
        postal_code: '34070'
      }
    };

    it('should accept the email address', async () => {
      const campsi = context.campsi;
      const res = await chai.request(campsi.app).post('/billing/customers').set('content-type', 'application/json').send(payload);

      res.status.should.eq(200);
    });

    it('should reject the email address', async () => {
      const campsi = context.campsi;
      payload.email = 'jlotery';
      const res = await chai.request(campsi.app).post('/billing/customers').set('content-type', 'application/json').send(payload);

      res.status.should.eq(400);
    });

    it('should reject the email address', async () => {
      const campsi = context.campsi;
      payload.email = 'jlotery@';
      const res = await chai.request(campsi.app).post('/billing/customers').set('content-type', 'application/json').send(payload);

      res.status.should.eq(400);
    });

    it('should reject the email address', async () => {
      const campsi = context.campsi;
      payload.email = 'jlotery@ucjiuhi';
      const res = await chai.request(campsi.app).post('/billing/customers').set('content-type', 'application/json').send(payload);

      res.status.should.eq(400);
    });
  });
  describe('/PUT', () => {
    const payload = {
      email: 'jlotery@hotmail.com',
      description: 'Quonference SASU',
      name: 'Quonference SASU',
      tax_exempt: 'none',
      metadata: {
        contactName: 'James Lotery',
        isProfessional: 'YES',
        projectId: '635b9335129af11d35a4b8ad',
        userId: '62bda10a647de869e67c973e'
      },
      preferred_locales: ['en-US', 'en-EN', 'en', 'fr-FR'],
      expand: 'sources|default_source|tax_ids',
      address: {
        line1: '1 here',
        city: 'Montpellier',
        country: 'FR',
        postal_code: '34070'
      }
    };

    it('should accept the email address', async () => {
      const campsi = context.campsi;
      const res = await chai
        .request(campsi.app)
        .put('/billing/customers/dummyid')
        .set('content-type', 'application/json')
        .send(payload);

      res.status.should.eq(200);
    });

    it('should reject the email address', async () => {
      const campsi = context.campsi;
      payload.email = 'jlotery';
      const res = await chai
        .request(campsi.app)
        .put('/billing/customers/dummyid')
        .set('content-type', 'application/json')
        .send(payload);

      res.status.should.eq(400);
    });

    it('should reject the email address', async () => {
      const campsi = context.campsi;
      payload.email = 'jlotery@';
      const res = await chai
        .request(campsi.app)
        .put('/billing/customers/dummyid')
        .set('content-type', 'application/json')
        .send(payload);

      res.status.should.eq(400);
    });

    it('should reject the email address', async () => {
      const campsi = context.campsi;
      payload.email = 'jlotery@ucjiuhi';
      const res = await chai
        .request(campsi.app)
        .put('/billing/customers/dummyid')
        .set('content-type', 'application/json')
        .send(payload);

      res.status.should.eq(400);
    });
  });
});
