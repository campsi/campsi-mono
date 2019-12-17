const path = require('path');
const LocalAssetStorage = require('../../lib/storages/local');
const host = 'http://localhost:3000';
const storageProviders = {
  local: new LocalAssetStorage({
    name: 'local',
    title: 'Serveur',
    dataPath: path.join(__dirname, '..', 'data'),
    baseUrl: host + '/assets'
  })
};

module.exports = {
  port: 3000,
  campsi: {
    title: 'Test Assets',
    publicURL: host,
    mongo: {
      host: 'localhost',
      port: 27017,
      database: 'test-campsi-service-assets'
    }
  },
  services: {
    assets: {
      title: 'Médias',
      options: {
        allowPublicListing: true,
        roles: ['public', 'admin'],
        order: ['local'],
        fallback: 'local',
        // todo copy / backup
        getStorage: () => storageProviders.local,
        storages: storageProviders
      }
    }
  }
};
