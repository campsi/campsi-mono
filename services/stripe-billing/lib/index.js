const CampsiService = require('../../../lib/service');
const helpers = require('../../../lib/modules/responseHelpers');

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
    metadata: Object.assign(
      body.metadata || {},
      user ? { user: user._id.toString() } : {}
    ),
    shipping: body.shipping,
    preferred_locales: [
      ...new Set(['fr-FR', ...(body.preferred_locales ?? [])])
    ],
    expand: ['tax_ids']
  };
};

const subscriptionExpand = [
  'latest_invoice',
  'latest_invoice.payment_intent',
  'pending_setup_intent'
];

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
    this.stripe = require('stripe')(this.options.secret_key);
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
      stripe.customers.create(
        bodyToCustomer(req.body, 'source', req.user),
        defaultHandler(res)
      );
    });

    this.router.get('/customers/:id', (req, res) => {
      req.query.expand = [
        ...new Set([...(req.query?.expand?.split('|') || []), 'tax_ids'])
      ].join('|');
      stripe.customers.retrieve(
        req.params.id,
        optionsFromQuery(req.query),
        defaultHandler(res)
      );
    });

    this.router.put('/customers/:id', (req, res) => {
      stripe.customers.update(
        req.params.id,
        bodyToCustomer(req.body, 'default_source'),
        defaultHandler(res)
      );
    });

    this.router.patch('/customers/:id', (req, res) => {
      const payload = req.body;
      if (payload.expand && typeof payload.expand === 'string') {
        payload.expand = payload.expand.split('|');
      }
      stripe.customers.update(req.params.id, payload, defaultHandler(res));
    });

    this.router.delete('/customers/:id', (req, res) => {
      stripe.customers.del(req.params.id, defaultHandler(res));
    });

    this.router.get('/customers/:customer/invoices', (req, res) => {
      stripe.invoices.list(
        Object.assign(
          { customer: req.params.customer },
          optionsFromQuery(req.query)
        ),
        defaultHandler(res)
      );
    });

    this.router.post('/customers/:customer/tax_ids', (req, res) => {
      stripe.customers.createTaxId(
        req.params.customer,
        { type: req.body.type, value: req.body.value },
        defaultHandler(res)
      );
    });

    this.router.post('/customers/:customer/sources', (req, res) => {
      stripe.customers.createSource(
        req.params.customer,
        { source: req.body.source },
        defaultHandler(res)
      );
    });

    this.router.delete('/customers/:customer/sources/:id', (req, res) => {
      stripe.customers.deleteSource(
        req.params.customer,
        req.params.id,
        defaultHandler(res)
      );
    });

    this.router.delete('/customers/:customer/tax_ids/:id', (req, res) => {
      stripe.customers.deleteTaxId(
        req.params.customer,
        req.params.id,
        defaultHandler(res)
      );
    });

    this.router.post('/subscriptions', (req, res) => {
      stripe.subscriptions.create(
        {
          customer: req.body.customer,
          collection_method: 'charge_automatically',
          items: req.body.items,
          metadata: req.body.metadata,
          coupon: req.body.coupon,
          promotion_code: req.body.promotion_code,
          expand: subscriptionExpand,
          default_tax_rates: req.body.default_tax_rates,
          default_source: req.body.default_source
        },
        defaultHandler(res)
      );
    });

    this.router.get('/subscriptions/:id', (req, res) => {
      stripe.subscriptions.retrieve(
        req.params.id,
        optionsFromQuery(req.query),
        defaultHandler(res)
      );
    });

    this.router.delete('/subscriptions/:id', (req, res) => {
      stripe.subscriptions.del(req.params.id, defaultHandler(res));
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
          expand: subscriptionExpand,
          default_tax_rates: req.body.default_tax_rates,
          default_source: req.body.default_source
        },
        defaultHandler(res)
      );
    });

    this.router.patch('/subscriptions/:id', (req, res) => {
      const payload = req.body;
      if (payload.expand && typeof payload.expand === 'string') {
        payload.expand = payload.expand.split('|');
      }
      stripe.subscriptions.update(req.params.id, payload, defaultHandler(res));
    });

    this.router.get('/sources/:id', (req, res) => {
      stripe.sources.retrieve(
        req.params.id,
        optionsFromQuery(req.query),
        defaultHandler(res)
      );
    });

    this.router.get('/invoices/:id', (req, res) => {
      stripe.invoices.retrieve(
        req.params.id,
        optionsFromQuery(req.query),
        defaultHandler(res)
      );
    });
    this.router.get('/payment_intents/:id', (req, res) => {
      stripe.paymentIntents.retrieve(
        req.params.id,
        optionsFromQuery(req.query),
        defaultHandler(res)
      );
    });
    this.router.post('/setup_intents', (req, res) => {
      stripe.setupIntents.create(
        {
          confirm: true,
          payment_method: req.body.payment_method,
          customer: req.body.customer,
          payment_method_types: ['card', 'sepa_debit'],
          metadata: req.body.metadata
        },
        defaultHandler(res)
      );
    });

    this.router.get(
      '/coupons/:code[:]check-validity',
      this.checkCouponCodeValidity
    );

    return super.initialize();
  }

  fetchSubscription(subscriptionId, cb) {
    this.stripe.subscriptions.retrieve(subscriptionId, cb);
  }
  /**
   * @see https://stripe.com/docs/api/invoices/list
   * @param {Object} parameters can be customer, subscription, status... ex: { customer: 'cus_abc123' }
   * @return {Object}
   */
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
  fetchCreditNotes = async parameters => {
    const creditNotes = [];
    parameters = { ...parameters, limit: 100 };
    for await (const creditNote of this.stripe.creditNotes.list(parameters)) {
      creditNotes.push(creditNote);
    }
    return creditNotes;
  };

  checkCouponCodeValidity = async (req, res) => {
    const code = req.params.code;
    if (!code) {
      return helpers.missingParameters(
        res,
        new Error('code must be specified')
      );
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
      return res
        .status(err.statusCode || 500)
        .json({ message: err.raw?.message || `invalid code ${code}` });
    }
  };
};
