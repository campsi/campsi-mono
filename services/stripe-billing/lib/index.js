const CampsiService = require("campsi-mono/lib/service");
const helpers = require("campsi-mono/lib/modules/responseHelpers");

const bodyToCustomer = (body, sourcePropertyName, user) => {
  return {
    name: String(body.name),
    description: String(body.description),
    source: body.source,
    [sourcePropertyName]: body.default_source,
    email: body.email,
    invoice_prefix: body.invoice_prefix,
    tax_id_data: body.tax_id_data,
    address: body.address,
    metadata: Object.assign(
      body.metadata || {},
      user ? { user: user._id.toString() } : {}
    ),
    shipping: body.shipping
  };
};

const subscriptionExpand = [
  "latest_invoice",
  "latest_invoice.payment_intent",
  "pending_setup_intent"
];

const optionsFromQuery = query => {
  const options = {};
  if (query.expand) {
    options.expand = query.expand.split("|");
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
    this.stripe = require("stripe")(this.options.secret_key);
    const stripe = this.stripe;

    this.router.use((req, res, next) => {
      req.service = this;
      next();
    });

    this.router.post("/webhook", (req, res) => {
      res.send("OK");
      this.emit("webhook", req.body);
    });

    this.router.post("/customers", (req, res) => {
      stripe.customers.create(
        bodyToCustomer(req.body, "source", req.user),
        defaultHandler(res)
      );
    });

    this.router.get("/customers/:id", (req, res) => {
      stripe.customers.retrieve(
        req.params.id,
        optionsFromQuery(req.query),
        defaultHandler(res)
      );
    });

    this.router.put("/customers/:id", (req, res) => {
      stripe.customers.update(
        req.params.id,
        bodyToCustomer(req.body, "default_source"),
        defaultHandler(res)
      );
    });

    this.router.delete("/customers/:id", (req, res) => {
      stripe.customers.del(req.params.id, defaultHandler(res));
    });

    this.router.get("/customers/:customer/invoices", (req, res) => {
      stripe.invoices.list(
        Object.assign(
          { customer: req.params.customer },
          optionsFromQuery(req.query)
        ),
        defaultHandler(res)
      );
    });

    this.router.post("/customers/:customer/tax_ids", (req, res) => {
      stripe.customers.createTaxId(
        req.params.customer,
        { type: req.body.type, value: req.body.value },
        defaultHandler(res)
      );
    });

    this.router.delete("/customers/:customer/tax_ids/:id", (req, res) => {
      stripe.customers.deleteTaxId(
        req.params.customer,
        req.params.id,
        defaultHandler(res)
      );
    });

    this.router.post("/subscriptions", (req, res) => {
      stripe.subscriptions.create(
        {
          customer: req.body.customer,
          billing: "charge_automatically",
          items: req.body.items,
          metadata: req.body.metadata,
          coupon: req.body.coupon,
          expand: subscriptionExpand,
          default_tax_rates: req.body.default_tax_rates
        },
        defaultHandler(res)
      );
    });

    this.router.get("/subscriptions/:id", (req, res) => {
      stripe.subscriptions.retrieve(
        req.params.id,
        optionsFromQuery(req.query),
        defaultHandler(res)
      );
    });

    this.router.delete("/subscriptions/:id", (req, res) => {
      stripe.subscriptions.del(req.params.id, defaultHandler(res));
    });

    this.router.put("/subscriptions/:id", (req, res) => {
      stripe.subscriptions.update(
        req.params.id,
        {
          billing: "charge_automatically",
          items: req.body.items,
          metadata: req.body.metadata,
          coupon: req.body.coupon,
          expand: subscriptionExpand,
          default_tax_rates: req.body.default_tax_rates
        },
        defaultHandler(res)
      );
    });

    this.router.get("/sources/:id", (req, res) => {
      stripe.sources.retrieve(
        req.params.id,
        optionsFromQuery(req.query),
        defaultHandler(res)
      );
    });

    this.router.get("/invoices/:id", (req, res) => {
      stripe.invoices.retrieve(
        req.params.id,
        optionsFromQuery(req.query),
        defaultHandler(res)
      );
    });
    this.router.get("/payment_intents/:id", (req, res) => {
      stripe.paymentIntents.retrieve(
        req.params.id,
        optionsFromQuery(req.query),
        defaultHandler(res)
      );
    });
    this.router.post("/setup_intents", (req, res) => {
      stripe.setupIntents.create(
        {
          confirm: true,
          payment_method: req.body.payment_method,
          customer: req.body.customer,
          payment_method_types: ["card"],
          metadata: req.body.metadata
        },
        defaultHandler(res)
      );
    });
    return super.initialize();
  }

  fetchSubscription(subscriptionId, cb) {
    this.stripe.subscriptions.retrieve(subscriptionId, cb);
  }
};
