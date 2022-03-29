const host = 'https://localhost:3003';

module.exports = {
  port: process.env.PORT || 3000,
  campsi: {
    title: 'Test Arezzo',
    publicURL: host,
    mongo: {
      host: 'localhost',
      port: 27017,
      database: 'test-campsi-service-auth'
    }
  },
  services: {
    trace: {
      title: 'trace'
    },
    auth: {
      title: 'Authentification',
      options: {
        collectionName: '__users__',
        session: {
          secret: 'sqkerhgtkusyd'
        },
        providers: {
          local: require('../../lib/providers/local')({
            baseUrl: host + '/auth',
            salt: 'CNDygyeFC6536964425994',
            resetPasswordTokenExpiration: 10
          }),
          github: require('../../lib/providers/github')({
            baseUrl: host + '/auth',
            clientID: '96a51bcde35bc5f08f50',
            clientSecret: 'e492264cae11297e90ba0d20c25f13a95094111e'
          })
        }
      }
    }
  }
};
