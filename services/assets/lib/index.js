const CampsiService = require('campsi/lib/service');
const helpers = require('campsi/lib/modules/responseHelpers');
const handlers = require('./handlers');
const param = require('./param');
const multer = require('multer');
const format = require('string-format');
const notAvailable = (req, res) => {
  helpers.serviceNotAvailable(res, new Error('Assets listing is not available'));
};
format.extend(String.prototype);

class AssetsService extends CampsiService {
  initialize() {
    this.collection = this.db.collection('assets.{0}'.format(this.path));
    this.router.use((req, res, next) => {
      req.service = this;
      next();
    });
    this.router.param('asset', param.attachAsset);
    this.router.param('asset', param.attachStorage);
    this.router.post('/', multer().array('file'), handlers.postAssets);
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
