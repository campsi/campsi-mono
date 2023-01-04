/* eslint-disable no-prototype-builtins */
const CampsiService = require('../../../lib/service');
const helpers = require('../../../lib/modules/responseHelpers');
const crypto = require('crypto');

const subscriptionExpand = ['latest_invoice', 'latest_invoice.payment_intent', 'pending_setup_intent'];
const customerExpand = ['tax_ids'];

const buildExpandFromBody = (body, defaultExpand = []) => {
  let expand = defaultExpand;
  if (body.expand) {
    if (typeof body.expand === 'string') {
      expand = [...new Set([...defaultExpand, ...body.expand.split('|')])];
    } else if (Array.isArray(body.expand)) {
      expand = [...new Set([...defaultExpand, ...body.expand])];
    }
  }
  return expand;
};

const buildExpandFromQuery = (query, defaultExpand) => {
  return [...new Set([...defaultExpand, ...(query?.expand?.split('|') || [])])].join('|');
};

const bodyToCustomer = (body, sourcePropertyName, user) => {

  return {
    name: String(body.name),
    description: String(body.description),
    source: body.source,
    [sourcePropertyName]: body.default_source,
    email: body.email?.toLowerCase(),
    invoice_prefix: body.invoice_prefix,
    tax_id_data: body.tax_id_data,
    tax_exempt: body.tax_exempt || 'none',
    address: body.address,
    metadata: Object.assign(body.metadata || {}, user ? { user: user._id.toString() } : {}),
    shipping: body.shipping,
    preferred_locales: [...new Set([...(body.preferred_locales ?? []), 'fr-FR'])],
    expand: buildExpandFromBody(body, customerExpand)
  };
};

const optionsFromQuery = query => {
  const options = {};
  if (query.expand) {
    options.expand = query.expand.split('|');
  }
  return options;
};

const defaultHandler = res => (err, obj) => {
  if (err) {
    helpers.error(res, err);
    console.error(err);
  } else {
    helpers.json(res, obj);
  }
};

module.exports = class StripeBillingService extends CampsiService {
  initialize() {
    this.stripe = require('stripe')(this.options.secret_key, {
      maxNetworkRetries: 3
    });
    const stripe = this.stripe;

    this.router.use((req, res, next) => {
      req.service = this;
      next();
    });

    this.router.post('/webhook', (req, res) => {
      res.send('OK');
      this.emit('webhook', req.body);
    });

    this.router.post('/customers', (req, res) => {
      try {
        this.checkEmailValidity(req.body?.email);
        const params = bodyToCustomer(req.body, 'source', req.user);
        const idempotencyKey = this.createIdempotencyKey(params, 'customers.create');
        stripe.customers.create(params, { idempotencyKey }, defaultHandler(res));
      }
      catch (ex) {
        res.status(400).json(ex);
      }
    });

    this.router.get('/customers/:id', (req, res) => {
      req.query.expand = buildExpandFromQuery(req.query, customerExpand);
      stripe.customers.retrieve(req.params.id, optionsFromQuery(req.query), defaultHandler(res));
    });

    this.router.put('/customers/:id', (req, res) => {
      try {
        this.checkEmailValidity(req?.body.email);
        stripe.customers.update(req.params.id, bodyToCustomer(req.body, 'default_source'), defaultHandler(res));
      }
      catch(err) {
        res.status(400).json(err);
      }
    });

    this.router.patch('/customers/:id', (req, res) => {
      req.body.expand = buildExpandFromBody(req.body, customerExpand);
      stripe.customers.update(req.params.id, req.body, defaultHandler(res));
    });

    this.router.delete('/customers/:id', (req, res) => {
      stripe.customers.del(req.params.id, defaultHandler(res));
    });

    this.router.get('/customers/:customer/invoices', (req, res) => {
      stripe.invoices.list(Object.assign({ customer: req.params.customer }, optionsFromQuery(req.query)), defaultHandler(res));
    });

    this.router.post('/customers/:customer/tax_ids', (req, res) => {
      stripe.customers.createTaxId(req.params.customer, { type: req.body.type, value: req.body.value }, defaultHandler(res));
    });

    this.router.post('/customers/:customer/sources', (req, res) => {
      stripe.customers.createSource(req.params.customer, { source: req.body.source }, defaultHandler(res));
    });

    this.router.delete('/customers/:customer/sources/:id', (req, res) => {
      stripe.customers.deleteSource(req.params.customer, req.params.id, defaultHandler(res));
    });

    this.router.delete('/customers/:customer/tax_ids/:id', (req, res) => {
      stripe.customers.deleteTaxId(req.params.customer, req.params.id, defaultHandler(res));
    });

    this.router.post('/subscriptions', (req, res) => {
      const params = {
        customer: req.body.customer,
        collection_method: 'charge_automatically',
        items: req.body.items,
        metadata: req.body.metadata,
        coupon: req.body.coupon,
        promotion_code: req.body.promotion_code,
        expand: buildExpandFromBody(req.body, subscriptionExpand),
        default_tax_rates: req.body.default_tax_rates,
        default_source: req.body.default_source
      };
      const idempotencyKey = this.createIdempotencyKey(params, 'subscriptions.create');
      stripe.subscriptions.create(params, { idempotencyKey }, defaultHandler(res)
      );
    });

    this.router.getAsync('/subscriptions/:id[:]get-next-invoice', async (req, res) => {
      const subscriptionId = req.params.id;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const nextInvoice = await stripe.invoices.retrieveUpcoming({
        customer: subscription.customer,
        subscription: subscription.id
      });
      res.json(nextInvoice);
    });

    this.router.get('/subscriptions/:id', (req, res) => {
      req.query.expand = buildExpandFromQuery(req.query, subscriptionExpand);
      stripe.subscriptions.retrieve(req.params.id, optionsFromQuery(req.query), defaultHandler(res));
    });

    this.router.delete('/subscriptions/:id', (req, res) => {
      const params = {};
      if (req.body.invoice_now) {
        params.invoice_now = req.body.invoice_now;
      }
      stripe.subscriptions.del(req.params.id, params, defaultHandler(res));
    });

    this.router.put('/subscriptions/:id', (req, res) => {
      stripe.subscriptions.update(
        req.params.id,
        {
          collection_method: 'charge_automatically',
          items: req.body.items,
          metadata: req.body.metadata,
          coupon: req.body.coupon,
          promotion_code: req.body.promotion_code,
          expand: buildExpandFromBody(req.body, subscriptionExpand),
          default_tax_rates: req.body.default_tax_rates,
          default_source: req.body.default_source
        },
        defaultHandler(res)
      );
    });

    this.router.patch('/subscriptions/:id', (req, res) => {
      req.body.expand = buildExpandFromBody(req.body, subscriptionExpand);
      stripe.subscriptions.update(req.params.id, req.body, defaultHandler(res));
    });

    this.router.get('/sources/:id', (req, res) => {
      stripe.sources.retrieve(req.params.id, optionsFromQuery(req.query), defaultHandler(res));
    });

    this.router.get('/invoices/:id', (req, res) => {
      stripe.invoices.retrieve(req.params.id, optionsFromQuery(req.query), defaultHandler(res));
    });

    this.router.getAsync('/subscription-schedules/:id', (req, res) => {
      stripe.subscriptionSchedules.retrieve(req.params.id, optionsFromQuery(req.query), defaultHandler(res));
    });

    this.router.postAsync('/subscription-schedules', (req, res) => {
      const params = {
        customer: req.body.customer,
        metadata: req.body.metadata,
        phases: req.body.phases,
        start_date: req.body.start_date,
        default_settings: req.body.default_settings,
        end_behavior: req.body.end_behavior,
        from_subscription: req.body.from_subscription,
        expand: buildExpandFromBody(req.body)
      };
      const idempotencyKey = this.createIdempotencyKey(params, 'subscriptionSchedules.create');
      stripe.subscriptionSchedules.create(params, { idempotencyKey }, defaultHandler(res));
    });

    this.router.putAsync('/subscription-schedules/:id', (req, res) => {
      stripe.subscriptionSchedules.update(
        req.params.id,
        {
          metadata: req.body.metadata,
          phases: req.body.phases,
          proration_behavior: req.body.proration_behavior,
          default_settings: req.body.default_settings,
          end_behavior: req.body.end_behavior,
          expand: buildExpandFromBody(req.body)
        },
        defaultHandler(res)
      );
    });

    this.router.postAsync('/subscription-schedules[:]list-all', async (req, res) => {
      const schedules = [];
      const params = {
        customer: req.body.customer,
        limit: parseInt(req.body.limit) <= 100 ? parseInt(req.body.limit) : 100,
        canceled_at: req.body.canceled_at,
        completed_at: req.body.completed_at,
        created: req.body.created,
        ending_before: req.body.ending_before,
        released_at: req.body.released_at,
        scheduled: req.body.scheduled,
        starting_after: req.body.starting_after,
        expand: buildExpandFromBody(req.body)
      };
      for await (const schedule of stripe.subscriptionSchedules.list(params)) {
        if (
          req.body.subscription &&
          !(schedule.subscription === req.body.subscription || schedule.subscription?.id === req.body.subscription)
        ) {
          continue;
        }
        if (req.body.status) {
          let status = req.body.status;
          if (typeof status !== 'string' && !Array.isArray(status)) {
            return helpers.badRequest(res, new Error(`subscription status type must be either string or array of strings`));
          }
          if (typeof status === 'string') {
            status = [status];
          }
          if (!status.includes(schedule.status)) {
            continue;
          }
        }
        schedules.push(schedule);
      }
      res.json(schedules);
    });

    this.router.deleteAsync('/subscription-schedules/:id[:]release', (req, res) => {
      stripe.subscriptionSchedules.release(
        req.params.id,
        { preserve_cancel_date: req.body.preserve_cancel_date },
        defaultHandler(res)
      );
    });

    this.router.post('/setup_intents', (req, res) => {
      const params = {
        confirm: true,
        payment_method: req.body.payment_method,
        customer: req.body.customer,
        payment_method_types: ['card', 'sepa_debit'],
        metadata: req.body.metadata
      };
      const idempotencyKey = this.createIdempotencyKey(params, 'setupIntents.create');
      stripe.setupIntents.create(params, { idempotencyKey }, defaultHandler(res)
      );
    });

    this.router.get('/coupons/:code[:]check-validity', this.checkCouponCodeValidity);

    this.router.get('/payment_intents/:id', (req, res) => {
      stripe.paymentIntents.retrieve(req.params.id, optionsFromQuery(req.query), defaultHandler(res));
    });
    this.router.post('/payment_intents/:id[:]confirm', (req, res) => {
      stripe.paymentIntents.confirm(req.params.id, defaultHandler(res));
    });
    this.router.post('/payment_intents', (req, res) => {
      const params = {
        confirm: req.body.confirm || true,
        amount: req.body.amount,
        currency: req.body.currency || 'eur',
        payment_method_types: ['card', 'sepa_debit'],
        setup_future_usage: req.body.setup_future_usage || 'off_session',
        customer: req.body.customer
      };
      if (req.body.payment_method) {
        params.payment_method = req.body.payment_method;
      }
      const idempotencyKey = this.createIdempotencyKey(params, 'paymentIntents.create');
      stripe.paymentIntents.create(params,{ idempotencyKey }, defaultHandler(res));
    });
    this.router.patch('/payment_intents/:id', (req, res) => {
      const payload = {
        setup_future_usage: req.body.setup_future_usage || 'off_session'
      };
      if (req.body.payment_method) {
        payload.payment_method = req.body.payment_method;
      }
      if (req.body.metadata) {
        payload.metadata = req.body.metadata;
      }
      stripe.paymentIntents.update(req.params.id, payload, defaultHandler(res));
    });

    return super.initialize();
  }

  fetchSubscription(subscriptionId, cb) {
    this.stripe.subscriptions.retrieve(subscriptionId, cb);
  }

  /**
   * Create idempotency key to avoid creating a stripe resource multiple time within the same second
   * @param params
   * @returns {string}
   */
  createIdempotencyKey(params, method) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({ ...params, method, now: new Date().toISOString().slice(0,-5) }))
      .digest('base64')
  }

  /**
   * @see https://stripe.com/docs/api/invoices/list
   * @param {Object} parameters can be customer, subscription, status... ex: { customer: 'cus_abc123' }
   * @return {Object}
   */
  // eslint-disable-next-line
  fetchInvoices = async parameters => {
    const invoices = [];
    parameters = { ...parameters, limit: 100 };
    for await (const invoice of this.stripe.invoices.list(parameters)) {
      invoices.push(invoice);
    }
    return invoices;
  };

  /**
   * @see https://stripe.com/docs/api/credit_notes/list
   * @param {Object} parameters can be customer, invoice... ex: { customer: 'cus_abc123' }
   * @return {Object}
   */
  // eslint-disable-next-line
  fetchCreditNotes = async parameters => {
    const creditNotes = [];
    parameters = { ...parameters, limit: 100 };
    for await (const creditNote of this.stripe.creditNotes.list(parameters)) {
      creditNotes.push(creditNote);
    }
    return creditNotes;
  };

  checkEmailValidity (email) {
    if (!/^\w+([.-/+]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      throw 'Invalid Email';
    }
  };

  // eslint-disable-next-line
  checkCouponCodeValidity = async (req, res) => {
    const code = req.params.code;
    if (!code) {
      return helpers.missingParameters(res, new Error('code must be specified'));
    }

    const promoCodes = await this.stripe.promotionCodes.list({
      limit: 1,
      active: true,
      code
    });

    if (promoCodes.data.length) {
      return res.json(promoCodes.data[0]);
    }
    // no promocode => let's find if there's a valid coupon with code as its id
    try {
      const coupon = await this.stripe.coupons.retrieve(code);
      if (!coupon.valid) {
        return helpers.badRequest(res, new Error(`invalid code ${code}`));
      }
      return res.json(coupon);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.raw?.message || `invalid code ${code}` });
    }
  };

  /**
   * @see https://stripe.com/docs/api/usage_records/create
   * @param {string} subscriptionItemId
   * @param {Object} params default action: set
   * @return {Object}
   */
  async createUsageRecord(subscriptionItemId, params) {
    if (!params || typeof params !== 'object') {
      throw new Error('You must provide a params object');
    }
    if (!params.hasOwnProperty('quantity') || !Number.isInteger(parseInt(params.quantity))) {
      throw new Error('You must provide proper quantity');
    }
    params.action = params.action ?? 'set';
    params.quantity = parseInt(params.quantity);
    return await this.stripe.subscriptionItems.createUsageRecord(subscriptionItemId, params);
  }

  /**
   * @see https://stripe.com/docs/api/usage_records/subscription_item_summary_list
   * @param {string} subscriptionItemId
   * @param {Object} params
   * @return {array}
   */
  async listUsageRecordSummaries(subscriptionItemId, params = {}) {
    const usageSummary = [];
    for await (const usage of this.stripe.subscriptionItems.listUsageRecordSummaries(subscriptionItemId, {
      limit: 100,
      ...params
    })) {
      usageSummary.push(usage);
    }
    return usageSummary;
  }
};
