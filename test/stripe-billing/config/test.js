module.exports = {
  port: process.env.PORT || 3000,
  campsi: {
    title: 'Test - Campsi Service Stripe Billing',
    description: 'Test - Campsi Service Stripe Billing',
    publicURL: `http://localhost:${process.env.PORT || 3000}`,
    mongo: {
      host: 'localhost',
      port: 27017,
      database: 'test-campsi-service-billing'
    }
  },
  services: {
    billing: {
      title: 'Contents',
      description: 'Tested Service',
      options: {
        secret_key: 'sk_test_TLvEhxPpHyrPhJeyMnJyM9jj',
        default_tax_percent: 20
      },
    }
  }
};
