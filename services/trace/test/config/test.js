module.exports = {
  port: 3000,
  campsi: {
    title: 'Test Arezzo',
    description: 'API de test avec les pizzas Arezzo !',
    publicURL: 'http://localhost:3000',
    mongo: {
      'host': 'localhost',
      'port': 27017,
      'database': 'relationships'
    }
  },
  services: {
    trace: {
      title: 'Trace/Debug',
      description: 'Trace your calls'
    }
  }
};
