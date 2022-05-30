const path = require('path');

const docsOptions = './options/docs.js';

module.exports = {
  port: process.env.PORT || 3000,
  campsi: {
    title: 'Test - Campsi Service Docs',
    description: 'Test - Campsi Service Docs',
    publicURL: `http://localhost:${process.env.PORT || 3000}`,
    mongo: {
      uri: 'mongodb://localhost:27017/test-campsi-service-docs',
      database: 'test-campsi-service-docs'
    }
  },
  services: {
    auth: {
      title: 'Authentification',
      options: {
        collectionName: '__users__',
        session: {
          secret: 'sqkerhgtkusyd'
        },
        providers: {
          local: require('../../../services/auth/lib/providers/local')({
            baseUrl: '//auth',
            salt: 'CNDygyeFC6536964425994',
            resetPasswordTokenExpiration: 10
          })
        }
      }
    },
    docs: {
      title: 'Contents',
      description: 'Tested Service',
      options: require(docsOptions),
      optionsBasePath: path.dirname(path.join(__dirname, docsOptions))
    }
  }
};
