module.exports = {
  port: 3000,
  campsi: {
    title: 'Test Arezzo',
    description: 'API de test avec les pizzas Arezzo !',
    publicURL: 'http://localhost:3000',
    mongo: {
      uri: 'mongodb://localhost:27017/test-campsi-service-trace',
      database: 'test-campsi-service-trace'
    }
  },
  services: {
    trace: {
      title: 'Trace/Debug',
      description: 'Trace your calls'
    }
  }
};
