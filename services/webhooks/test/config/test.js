const host = 'http://localhost:3000';

module.exports = {
  port: 3000,
  campsi: {
    publicURL: host,
    mongo: {
      'host': 'localhost',
      'port': 27017,
      'database': 'relationships'
    }
  },
  services: {
    trace: {
      title: 'trace'
    },
    webhooks: {
      title: 'WebHooks',
      options: {
        channel: 'webhooks',
        requireAuth: true
      }
    }
  }
};
