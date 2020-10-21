const debug = require('debug')('campsi:service:assets');
const path = require('path');
const helpers = require('../../../lib/modules/responseHelpers');
const http = require('http');
const serviceAsset = require('./services/asset');
const forIn = require('for-in');
const buildLink = require('../../../lib/modules/buildLink');

module.exports.postAssets = function postAssets (req, res) {
  // TODO create our own structure for files, be independent from multer
  serviceAsset.createAsset(req.service, req.files, req.user, req.headers)
    .then((data) => helpers.json(res, data))
    .catch(() => helpers.error(res));
};

module.exports.getAssets = function getAssets (req, res) {
  let pagination = {};
  pagination.perPage = req.query.perPage;
  pagination.page = req.query.page;

  serviceAsset.getAssets(req.service, pagination, req.query.sort)
    .then((data) => {
      let links = [];
      forIn(data.nav, (page, rel) => {
        if (page !== data.page) {
          links.push('<{0}>; rel="{1}"'.format(buildLink(req, page, ['perPage', 'sort']), rel));
        }
      });
      let headers = {
        'X-Total-Count': data.count,
        'X-Page': data.page,
        'X-Per-Page': data.perPage,
        'X-Last-Page': data.nav.last
      };
      if (links.length) {
        headers.Link = links.join(', ');
      }
      helpers.json(res, data.assets, headers);
    })
    .catch(() => {
      helpers.error(res);
    });
};

module.exports.sendLocalFile = function sendLocalFile (req, res) {
  res.sendFile(path.join(req.service.options.storages.local.dataPath, req.params[0]));
};

module.exports.streamAsset = function streamAsset (req, res) {
  const url = req.storage.getAssetURL(req.asset);
  const newReq = http.request(url, function (newRes) {
    let headers = newRes.headers;
    headers['Content-Disposition'] = 'attachment; filename="{0}"'.format(req.asset.originalName);
    headers['Content-Type'] = req.asset.clientReportedMimeType;
    headers['Content-Length'] = req.asset.size;
    res.writeHead(newRes.statusCode, headers);
    newRes.pipe(res);
  }).on('error', function (err) {
    debug('Streaming error: %s', err);
    res.statusCode = 500;
    res.end();
  });

  req.pipe(newReq);
};

module.exports.getAssetMetadata = function getAssetMetadata (req, res) {
  res.json(req.asset);
};

/**
 * @param {ExpressRequest} req
 * @param res
 */
module.exports.deleteAsset = function deleteAsset (req, res) {
  serviceAsset.deleteAsset(req.service, req.storage, req.asset)
    .then((result) => helpers.json(res, result))
    .catch((error) => helpers.error(res, error));
};
