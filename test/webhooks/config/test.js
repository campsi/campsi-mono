const host = 'http://localhost:3000';

module.exports = {
  port: 3000,
  campsi: {
    publicURL: host,
    mongo: {
      uri: 'mongodb://localhost:27017/test-campsi-service-webhooks',
      database: 'test-campsi-service-webhooks'
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
