/* eslint-disable no-prototype-builtins */
const CampsiService = require('../../../lib/service');
const crypto = require('crypto');
const helpers = require('../../../lib/modules/responseHelpers');
const CreateError = require('http-errors');
const { isEmailValid } = require('../../auth/lib/handlers');

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
  const customerPayload = {
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
  if (!customerPayload.default_source) {
    delete customerPayload.default_source; // can't be empty or unset
  }
  return customerPayload;
};

const optionsFromQuery = query => {
  const options = {};
  if (query.expand) {
    options.expand = query.expand.split('|');
  }
  return options;
};

module.exports = class StripeBillingService extends CampsiService {
  initialize() {
    this.stripe = require('stripe')(this.options.secret_key, {
      maxNetworkRetries: this.options.maxNetworkRetries || 3
    });
    const stripe = this.stripe;

    this.router.use((req, res, next) => {
      req.service = this;
      next();
    });

    const validateRequestAccess = (req, res, next) => {
      if (req.url === '/webhook') {
        return next();
      }
      if (typeof this.options.validateRequestAccess === 'function') {
        return this.options.validateRequestAccess(req, res, next);
      }
      return next();
    };

    this.router.all('*', validateRequestAccess);

    this.router.post('/webhook', (req, res) => {
      res.send('OK');
      this.emit('webhook', req.body);
    });

    this.router.post('/customers', async (req, res) => {
      this.checkEmailValidity(req.body?.email);
      const params = bodyToCustomer(req.body, 'source', req.user);
      const idempotencyKey = this.createIdempotencyKey(params, 'customers.create');
      const customer = await stripe.customers.create(params, { idempotencyKey });
      res.json(customer);
    });

    this.router.get('/customers/:id', async (req, res) => {
      req.query.expand = buildExpandFromQuery(req.query, customerExpand);
      const customer = await stripe.customers.retrieve(req.params.id, optionsFromQuery(req.query));
      res.json(customer);
    });

    this.router.put('/customers/:id', async (req, res) => {
      this.checkEmailValidity(req?.body.email);
      const customer = await stripe.customers.update(req.params.id, bodyToCustomer(req.body, 'default_source'));
      res.json(customer);
    });

    this.router.patch('/customers/:id', async (req, res) => {
      req.body.expand = buildExpandFromBody(req.body, customerExpand);
      const customer = await stripe.customers.update(req.params.id, req.body);
      res.json(customer);
    });

    this.router.delete('/customers/:id', async (req, res) => {
      const deletion = await stripe.customers.del(req.params.id);
      res.json(deletion);
    });

    this.router.get('/customers/:customer/invoices', async (req, res) => {
      const invoices = await this.fetchInvoices({
        ...optionsFromQuery(req.query),
        customer: req.params.customer
      });
      res.json(invoices);
    });

    this.router.post('/customers/:customer/tax_ids', async (req, res) => {
      const taxId = await stripe.customers.createTaxId(req.params.customer, { type: req.body.type, value: req.body.value });
      res.json(taxId);
    });

    this.router.post('/customers/:customer/sources', async (req, res) => {
      const source = await stripe.customers.createSource(req.params.customer, { source: req.body.source });
      res.json(source);
    });

    this.router.delete('/customers/:customer/sources/:id', async (req, res) => {
      const deletion = await stripe.customers.deleteSource(req.params.customer, req.params.id);
      res.json(deletion);
    });

    this.router.post('/customers/:customer/payment_methods', async (req, res) => {
      const paymentMethod = await stripe.paymentMethods.attach(req.body.payment_method, { customer: req.params.customer });
      res.json(paymentMethod);
    });

    this.router.get('/customers/:customer/payment_methods', async (req, res) => {
      const paymentMethods = [];
      const params = {
        customer: req.params.customer,
        limit: 100
      };
      if (req.query.type) {
        params.type = req.query.type;
      }
      for await (const paymentMethod of stripe.paymentMethods.list(params)) {
        paymentMethods.push(paymentMethod);
      }
      res.json(paymentMethods);
    });

    this.router.delete('/customers/:customer/payment_methods/:id', async (req, res) => {
      const deletion = await stripe.paymentMethods.detach(req.params.id);
      res.json(deletion);
    });

    this.router.delete('/customers/:customer/tax_ids/:id', async (req, res) => {
      const deletion = await stripe.customers.deleteTaxId(req.params.customer, req.params.id);
      res.json(deletion);
    });

    this.router.post('/subscriptions', async (req, res) => {
      const params = {
        customer: req.body.customer,
        collection_method: 'charge_automatically',
        items: req.body.items,
        metadata: req.body.metadata,
        coupon: req.body.coupon,
        promotion_code: req.body.promotion_code,
        expand: buildExpandFromBody(req.body, subscriptionExpand),
        default_tax_rates: req.body.default_tax_rates,
        default_source: req.body.default_source,
        default_payment_method: req.body.default_payment_method
      };
      if (req.body.currency) {
        params.currency = req.body.currency;
      }
      const idempotencyKey = this.createIdempotencyKey(params, 'subscriptions.create');
      const subscription = await stripe.subscriptions.create(params, { idempotencyKey });
      res.json(subscription);
    });

    this.router.get('/subscriptions/:id[:]get-next-invoice', async (req, res) => {
      const subscriptionId = req.params.id;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const nextInvoice = await stripe.invoices.retrieveUpcoming({
        customer: subscription.customer,
        subscription: subscription.id,
        expand: buildExpandFromBody(req.query)
      });
      res.json(nextInvoice);
    });

    this.router.get('/subscriptions/:id', async (req, res) => {
      req.query.expand = buildExpandFromQuery(req.query, subscriptionExpand);
      const subscription = await stripe.subscriptions.retrieve(req.params.id, optionsFromQuery(req.query));
      res.json(subscription);
    });

    this.router.delete('/subscriptions/:id', async (req, res) => {
      const params = {};
      ['invoice_now', 'prorate', 'cancellation_details', 'expand'].forEach(param => {
        if (req.body.hasOwnProperty(param)) {
          params[param] = req.body[param];
        }
      });
      if (params.expand) {
        params.expand = buildExpandFromBody(req.body, subscriptionExpand);
      }
      const canceledSubscription = await stripe.subscriptions.del(req.params.id, params);
      res.json(canceledSubscription);
    });

    this.router.put('/subscriptions/:id', async (req, res) => {
      const subscription = await stripe.subscriptions.update(req.params.id, {
        collection_method: req.body.collection_method || 'charge_automatically',
        items: req.body.items,
        metadata: req.body.metadata,
        coupon: req.body.coupon,
        promotion_code: req.body.promotion_code,
        expand: buildExpandFromBody(req.body, subscriptionExpand),
        default_tax_rates: req.body.default_tax_rates,
        default_source: req.body.default_source,
        default_payment_method: req.body.default_payment_method
      });
      res.json(subscription);
    });

    this.router.patch('/subscriptions/:id', async (req, res) => {
      req.body.expand = buildExpandFromBody(req.body, subscriptionExpand);
      const subscription = await stripe.subscriptions.update(req.params.id, req.body);
      res.json(subscription);
    });

    this.router.get('/sources/:id', async (req, res) => {
      const source = await stripe.sources.retrieve(req.params.id, optionsFromQuery(req.query));
      res.json(source);
    });

    this.router.get('/payment_methods/:id', async (req, res) => {
      const paymentMethod = await stripe.paymentMethods.retrieve(req.params.id, optionsFromQuery(req.query));
      res.json(paymentMethod);
    });

    this.router.patch('/payment_methods/:id', async (req, res) => {
      const params = {};
      ['billing_details', 'metadata', 'allow_redisplay'].forEach(param => {
        if (req.body.hasOwnProperty(param)) {
          params[param] = req.body[param];
        }
      });
      const paymentMethod = await stripe.paymentMethods.update(req.params.id, params);
      res.json(paymentMethod);
    });

    this.router.get('/invoices/:id', async (req, res) => {
      const invoice = await stripe.invoices.retrieve(req.params.id, optionsFromQuery(req.query));
      res.json(invoice);
    });

    this.router.get('/subscription-schedules/:id', async (req, res) => {
      const schedule = await stripe.subscriptionSchedules.retrieve(req.params.id, optionsFromQuery(req.query));
      res.json(schedule);
    });

    this.router.post('/subscription-schedules', async (req, res) => {
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
      const schedule = await stripe.subscriptionSchedules.create(params, { idempotencyKey });
      res.json(schedule);
    });

    this.router.put('/subscription-schedules/:id', async (req, res) => {
      const schedule = await stripe.subscriptionSchedules.update(req.params.id, {
        metadata: req.body.metadata,
        phases: req.body.phases,
        proration_behavior: req.body.proration_behavior,
        default_settings: req.body.default_settings,
        end_behavior: req.body.end_behavior,
        expand: buildExpandFromBody(req.body)
      });
      res.json(schedule);
    });

    this.router.post('/subscription-schedules[:]list-all', async (req, res) => {
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

    this.router.delete('/subscription-schedules/:id[:]release', async (req, res) => {
      const releasedSchedule = await stripe.subscriptionSchedules.release(req.params.id, {
        preserve_cancel_date: req.body.preserve_cancel_date
      });
      res.json(releasedSchedule);
    });

    this.router.post('/setup_intents', async (req, res) => {
      const params = {
        confirm: true,
        customer: req.body.customer,
        payment_method: req.body.payment_method,
        payment_method_types: ['card', 'sepa_debit'],
        payment_method_options: req.body.payment_method_options,
        metadata: req.body.metadata
      };
      if (req.body.payment_method_options?.sepa_debit || req.body.payment_method_type === 'sepa_debit') {
        params.mandate_data = {
          customer_acceptance: {
            type: 'online',
            online: {
              ip_address: req.headers['x-forwarded-for'] || req.ip,
              user_agent: req.headers['user-agent']
            }
          }
        };
      }
      if (req.body.expand) {
        params.expand = buildExpandFromBody(req.body);
      }
      const idempotencyKey = this.createIdempotencyKey(params, 'setupIntents.create');
      const setupIntent = await stripe.setupIntents.create(params, { idempotencyKey });
      res.json(setupIntent);
    });

    this.router.get('/coupons/:code[:]check-validity', this.checkCouponCodeValidity);

    this.router.get('/payment_intents/:id', async (req, res) => {
      const paymentIntent = await stripe.paymentIntents.retrieve(req.params.id, optionsFromQuery(req.query));
      res.json(paymentIntent);
    });

    this.router.post('/payment_intents/:id[:]confirm', async (req, res) => {
      const params = optionsFromQuery(req.query);
      ['payment_method', 'payment_method_options'].forEach(param => {
        if (req.body[param]) {
          params[param] = req.body[param];
        }
      });
      if (req.body.payment_method_options?.sepa_debit || req.body.payment_method_type === 'sepa_debit') {
        params.mandate_data = {
          customer_acceptance: {
            type: 'online',
            online: {
              ip_address: req.headers['x-forwarded-for'] || req.ip,
              user_agent: req.headers['user-agent']
            }
          }
        };
      }
      const paymentIntentConfirmation = await stripe.paymentIntents.confirm(req.params.id, params);
      res.json(paymentIntentConfirmation);
    });

    this.router.post('/payment_intents', async (req, res) => {
      const params = {
        confirm: req.body.confirm || true,
        amount: req.body.amount,
        currency: req.body.currency || 'eur',
        payment_method_types: ['card', 'sepa_debit'],
        payment_method: req.body.payment_method,
        payment_method_options: req.body.payment_method_options,
        setup_future_usage: req.body.setup_future_usage || 'off_session',
        customer: req.body.customer
      };

      if ((req.body.payment_method_options?.sepa_debit || req.body.payment_method_type === 'sepa_debit') && params.confirm) {
        params.mandate_data = {
          customer_acceptance: {
            type: 'online',
            online: {
              ip_address: req.headers['x-forwarded-for'] || req.ip,
              user_agent: req.headers['user-agent']
            }
          }
        };
      }
      const idempotencyKey = this.createIdempotencyKey(params, 'paymentIntents.create');
      const paymentIntent = await stripe.paymentIntents.create(params, { idempotencyKey });
      res.json(paymentIntent);
    });

    this.router.patch('/payment_intents/:id', async (req, res) => {
      const payload = {
        setup_future_usage: req.body.setup_future_usage || 'off_session'
      };
      if (req.body.payment_method) {
        payload.payment_method = req.body.payment_method;
      }
      if (req.body.metadata) {
        payload.metadata = req.body.metadata;
      }
      const paymentIntent = await stripe.paymentIntents.update(req.params.id, payload);
      res.json(paymentIntent);
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
      .update(JSON.stringify({ ...params, method, now: new Date().toISOString().slice(0, -6) }))
      .digest('base64');
  }

  /**
   * @see https://stripe.com/docs/api/invoices/list
   * @param {Object} parameters can be customer, subscription, status... ex: { customer: 'cus_abc123' }
   * @return {Object}
   */
  // eslint-disable-next-line
  fetchInvoices = async parameters => {
    const invoices = [];
    for await (const invoice of this.stripe.invoices.list({ ...parameters, limit: 100 })) {
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

  checkEmailValidity(email) {
    if (!isEmailValid(email)) {
      throw new CreateError(400, 'Invalid Email');
    }
  }

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
