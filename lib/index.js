const CampsiService = require('campsi/lib/service');

const bodyToCustomer = (body, user) => {
  return {
    description: body.description,
    account_balance: body.account_balance,
    coupon: body.coupon,
    source: body.source,
    default_source: body.default_source,
    email: body.email,
    invoice_prefix: body.invoice_prefix,
    metadata: Object.assign(body.metadata || {}, {user: req.user._id}),
    shipping: body.shipping
  }
};

module.exports = class StripeBillingService extends CampsiService {
  initialize () {
    this.stripe = require('stripe')(this.options.secret_key);
    const stripe = this.stripe;
    this.collections = {
      customers: this.db.collection(`stripe_billing.${this.path}.customers`),
      subscriptions: this.db.collection(`stripe_billing.${this.path}.subscriptions`)
    };
    this.router.use((req, res, next) => {
      req.service = this;
      next();
    });

    this.router.post('/customers', (req, res) => {
      stripe.customers.create(bodyToCustomer(req.body, req.user), (err, customer) => {
        // todo store in collection and attach to req.user
        res.json(customer);
      });
    });

    this.router.get('/customers/:id', (req, res) => {
      stripe.customers.retrieve(req.params.id, (err, customer) => {
        res.json(customer);
      })
    });

    this.router.put('/customers/:id', (req, res) => {
      stripe.customers.update(req.params.id, bodyToCustomer(req.body), (err, customer) => {
        res.json(customer);
      });
    });

    this.router.delete('/customers/:id', (req, res) => {
      stripe.customers.del(req.params.id, (err, confirmation) => {
        res.json(confirmation)
      });
    });

    this.router.post('/subscription', (req, res) => {
      stripe.subscriptions.create({
        customer: req.body.customer,
        billing: 'charge_automatically',
        items: req.body.items,
        metadata: req.body.metadata
      }, (err, subscription) => {
        // todo store id in collection ?
        res.json(subscription);
      });
    });

    this.router.get('/invoices');
    return super.initialize();
  }
};
