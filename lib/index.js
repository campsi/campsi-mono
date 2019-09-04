const CampsiService = require('campsi/lib/service');
const helpers = require('campsi/lib/modules/responseHelpers');

const bodyToCustomer = (body, sourcePropertyName, user) => {
  return {
    description: body.description,
    account_balance: body.account_balance,
    source: body.source,
    [sourcePropertyName]: body.default_source,
    email: body.email,
    invoice_prefix: body.invoice_prefix,
    metadata: Object.assign(body.metadata || {}, user ? {user: user._id.toString()} : {}),
    shipping: body.shipping
  }
};

const defaultHandler = (res) => (err, obj) => {
  if(err) {
    helpers.error(res, err);
    console.error(err);
  } else {
    helpers.json(res, obj);
  }
};

module.exports = class StripeBillingService extends CampsiService {
  initialize () {
    this.stripe = require('stripe')(this.options.secret_key);
    const stripe = this.stripe;

    this.router.use((req, res, next) => {
      req.service = this;
      next();
    });

    this.router.post('/customers', (req, res) => {
      stripe.customers.create(bodyToCustomer(req.body, 'source', req.user), defaultHandler(res));
    });

    this.router.get('/customers/:id', (req, res) => {
      stripe.customers.retrieve(req.params.id, defaultHandler(res))
    });

    this.router.put('/customers/:id', (req, res) => {
      stripe.customers.update(req.params.id, bodyToCustomer(req.body, 'default_source'), defaultHandler(res));
    });

    this.router.delete('/customers/:id', (req, res) => {
      stripe.customers.del(req.params.id, defaultHandler(res));
    });

    this.router.get('/customers/:customer/invoices', (req, res) => {
      stripe.invoices.list({
        customer: req.params.customer
      }, defaultHandler(res))
    });

    this.router.post('/subscriptions', (req, res) => {
      stripe.subscriptions.create({
        customer: req.body.customer,
        billing: 'charge_automatically',
        items: req.body.items,
        metadata: req.body.metadata,
        coupon: req.body.coupon,
        tax_percent: req.body.tax_percent || this.options.default_tax_percent,
      }, defaultHandler(res));
    });

    this.router.get('/subscriptions/:id', {expand: req.query.expand ? req.query.expand.split('|') : []}, (req, res) => {
      stripe.subscriptions.retrieve(req.params.id, defaultHandler(res));
    });

    this.router.delete('/subscriptions/:id', (req, res) => {
      stripe.subscriptions.del(req.params.id, defaultHandler(res));
    });

    this.router.put('/subscriptions/:id', (req, res) => {
      stripe.subscriptions.update(req.params.id, {
        billing: 'charge_automatically',
        items: req.body.items,
        metadata: req.body.metadata,
        coupon: req.body.coupon
      }, defaultHandler(res));
    });

    this.router.get('/sources/:id', (req, res) => {
      stripe.sources.retrieve(req.params.id, defaultHandler(res));
    });

    this.router.get('/invoices/:id', (req, res) => {
      stripe.invoices.retrieve(req.params.id, defaultHandler(res));
    });

    this.router.get('/payment_intents/:id', (req, res) => {
      stripe.payment_intents.retrieve(req.params.id, defaultHandler(res));
    });
    return super.initialize();
  }

  fetchSubscription(subscriptionId, cb) {
    this.stripe.subscriptions.retrieve(subscriptionId, cb)
  }
};
