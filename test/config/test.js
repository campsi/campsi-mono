const path = require('path');
const host = 'http://localhost:3000';
const LocalAssetStorage = require('../../services/assets/lib/storages/local');
const S3AssetStorage = require('../../services/assets/lib/storages/s3');

const storageProviders = {
  local: new LocalAssetStorage({
    name: 'local',
    title: 'Serveur',
    dataPath: path.join(__dirname, '..', 'data'),
    baseUrl: host + '/assets'
  }),
  s3: new S3AssetStorage({
    bucket: 'campsi-assets-test-bucket',
    dataPath: '/',
    getPublicAssetURL: data => {
      return `https://campsi-assets-test.imgix.net/${data.key}`;
    }
  })
};
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
    test: {},
    trace: {
      title: 'Trace',
      options: {}
    },
    assets: {
      title: 'Médias',
      options: {
        allowPublicListing: true,
        roles: ['public', 'admin'],
        order: ['local', 's3'],
        fallback: 'local',
        // todo copy / backup
        getStorage: (file, user, headers) => storageProviders.s3,
        storages: storageProviders
      }
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
