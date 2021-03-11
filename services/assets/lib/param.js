const helpers = require('../../../lib/modules/responseHelpers');
const createObjectID = require('../../../lib/modules/createObjectID');
const debug = require('debug')('campsi:services:assets');

module.exports.attachAsset = function (req, res, next, id) {
  req.service.collection
    .findOne({ _id: createObjectID(id) })
    .then(asset => {
      if (!asset) {
        return helpers.notFound(res);
      }
      req.asset = asset;
      next();
    })
    .catch(err => {
      debug('Finding asset error: %s', err);
      helpers.notFound(res);
    });
};

module.exports.attachStorage = function (req, res, next) {
  req.storage = req.asset.storage
    ? req.service.options.storages[req.asset.storage]
    : req.service.options.getStorage();
  if (!req.storage) {
    return helpers.error(res, {
      message: 'undefined storage',
      asset: req.asset
    });
  }
  next();
};
