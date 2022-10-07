const host = 'http://localhost:3000';

module.exports = {
  // Application configuration
  port: 3000,
  campsi: {
    title: 'Test',
    publicURL: 'http://localhost:3000',
    mongo: {
      uri: 'mongodb://localhost:27017/test-campsi',
      database: 'test-campsi'
    },
    bodyParser: {
      json: {
        limit: '10mb'
      }
    }
  },
  campsiPrefix: {
    title: 'Test',
    publicURL: 'http://localhost:3000/v1',
    mongo: {
      uri: 'mongodb://localhost:27017/test-campsi',
      database: 'test-campsi'
    }
  },
  services: {
    test: {},
    auth: {
      title: 'Authentification',
      options: {
        collectionName: '__custom_users__',
        session: {
          secret: 'sqkerhgtkusyd',
          collectionName: '__custom_sessions__'
        },
        providers: {
          local: require('../../../services/auth/lib/providers/local')({
            baseUrl: host + '/auth',
            salt: 'CNDygyeFC6536964425994',
            resetPasswordTokenExpiration: 10
          }),
          github: require('../../../services/auth/lib/providers/github')({
            baseUrl: host + '/auth',
            clientID: '96a51bcde35bc5f08f50',
            clientSecret: 'e492264cae11297e90ba0d20c25f13a95094111e'
          })
        }
      }
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
