const host = 'https://localhost:3003';

module.exports = {
  // Application configuration
  port: 3000,
  campsi: {
    title: 'Test',
    publicURL: 'http://localhost:3000',
    mongo: {
      uri: 'mongodb://localhost:27017/test-campsi',
      database: 'test-campsi'
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
    'test': {},
    trace: {
      title: 'Trace',
      options: {}
    },
    auth: {
      title: 'Authentification',
      options: {
        collectionName: '__users__',
        session: {
          secret: 'sqkerhgtkusyd'
        },
        providers: {
          local: require('../../services/auth/lib/providers/local')({
            baseUrl: host + '/auth',
            salt: 'CNDygyeFC6536964425994',
            resetPasswordTokenExpiration: 10
          }),
          github: require('../../services/auth/lib/providers/github')({
            baseUrl: host + '/auth',
            clientID: '96a51bcde35bc5f08f50',
            clientSecret: 'e492264cae11297e90ba0d20c25f13a95094111e'
          }),
          exaprint: require('../../services/auth/lib/providers/exaprint')({
            baseUrl: host + '/auth',
            protocol: 'https',
            host: 'stg-auth.exaprint.fr',
            clientID: '1da1255195',
            clientSecret: 'c2ec3249-1d79-4b7f-972a-3f720e9a1bc5'
          })
        }
      }
    }

  }
};
