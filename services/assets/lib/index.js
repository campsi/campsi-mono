/* eslint-disable node/no-unsupported-features/es-syntax */
/* eslint-disable node/no-unpublished-require */
const CampsiService = require('../../../lib/service');
const helpers = require('../../../lib/modules/responseHelpers');
const handlers = require('./handlers');
const param = require('./param');
const format = require('string-format');
const notAvailable = (req, res) => {
  helpers.serviceNotAvailable(res, new Error('Assets listing is not available'));
};
format.extend(String.prototype);
const busboyBodyParser = require('busboy-body-parser');

class AssetsService extends CampsiService {
  async initialize() {
    this.collection = this.db.collection('assets.{0}'.format(this.path));
    this.router.use((req, res, next) => {
      req.service = this;
      next();
    });
    // this.server.app.use(busboyBodyParser({ multi: true }));
    this.router.param('asset', param.attachAsset);
    this.router.param('asset', param.attachStorage);
    this.router.post('/copy', handlers.copyRemote, handlers.postAssets);
    this.router.post('/', busboyBodyParser({ multi: true }), handlers.postAssets);
    this.router.get('/', this.options.allowPublicListing ? handlers.getAssets : notAvailable);
    this.router.get('/local/*', handlers.sendLocalFile);
    this.router.get('/:asset/metadata', handlers.getAssetMetadata);
    this.router.get('/:asset', handlers.streamAsset);
    this.router.delete('/:asset', handlers.deleteAsset);
    return super.initialize();
  }
}

AssetsService.LocalAssetStorage = require('./storages/local');
AssetsService.S3AssetStorage = require('./storages/s3');

module.exports = AssetsService;
