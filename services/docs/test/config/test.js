const path = require('path');

const docsOptions = './options/docs.js';

module.exports = {
  port: process.env.PORT || 3000,
  campsi: {
    title: 'Test - Campsi Service Docs',
    description: 'Test - Campsi Service Docs',
    publicURL: `http://localhost:${process.env.PORT || 3000}`,
    mongo: {
      host: 'localhost',
      port: 27017,
      database: 'test-campsi-service-docs'
    }
  },
  services: {
    docs: {
      title: 'Contents',
      description: 'Tested Service',
      options: require(docsOptions),
      optionsBasePath: path.dirname(path.join(__dirname, docsOptions))
    }
  }
};
