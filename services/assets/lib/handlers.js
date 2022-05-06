const debug = require('debug')('campsi:service:assets');
const path = require('path');
const helpers = require('../../../lib/modules/responseHelpers');
const http = require('http');
const serviceAsset = require('./services/asset');
const buildLink = require('../../../lib/modules/buildLink');
const https = require('https');

module.exports.postAssets = function postAssets (req, res) {
  // TODO create our own structure for files, be independent from multer
  serviceAsset
    .createAsset(req.service, req.files, req.user, req.headers)
    .then(data => helpers.json(res, data))
    .catch(() => helpers.error(res));
};

module.exports.copyRemote = function copyRemote (req, res, next) {
  if (!req.body.url) {
    return helpers.badRequest(res, {
      message: 'Request payload must contain a `url` field'
    });
  }
  try {
    const url = new URL(req.body.url);
    const filename = url.pathname.substring(url.pathname.lastIndexOf('/') + 1);
    const clientReportedFileExtension = filename.substring(
      filename.lastIndexOf('.')
    );
    https.get(req.body.url, res => {
      req.files = [
        {
          stream: res,
          filename,
          clientReportedFileExtension,
          size: parseInt(res.headers['content-length']),
          clientReportedMimeType: res.headers['content-type'],
          detectedMimeType: res.headers['content-type']
        }
      ];
      next();
    });
  } catch (e) {
    return helpers.badRequest(res, e);
  }
};

module.exports.getAssets = function getAssets (req, res) {
  let pagination = {};
  pagination.perPage = req.query.perPage;
  pagination.page = req.query.page;

  serviceAsset
    .getAssets(req.service, pagination, req.query.sort)
    .then(data => {
      let links = [];
      Object.entries(data.nav).map(([rel, page]) => {
        if (!!page && page !== data.page) {
          links.push(
            `<${buildLink(req, page, ['perPage', 'sort'])}>; rel="${rel}"`
          );
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
  res.sendFile(
    path.join(req.service.options.storages.local.dataPath, req.params[0])
  );
};

module.exports.streamAsset = function streamAsset (req, res) {
  if (req.storage.streamAsset) {
    return req.storage.streamAsset(req.asset).pipe(res);
  }
  const url = req.storage.getAssetURL(req.asset);
  const newReq = http
    .request(
      url,
      {
        headers: { Connection: 'keep-alive' }
      },
      function (newRes) {
        let headers = newRes.headers;
        headers['Content-Disposition'] = 'attachment; filename="{0}"'.format(
          req.asset.originalName
        );
        headers['Content-Type'] = req.asset.clientReportedMimeType;
        headers['Content-Length'] = req.asset.size;
        headers['Connection'] = 'keep-alive';
        res.writeHead(newRes.statusCode, headers);
        newRes.pipe(res);
      }
    )
    .on('error', function (err) {
      debug('Streaming error: %s', err);
      res.statusCode = 500;
      res.json({
        error: err,
        message: 'Streaming error, could not forward to ' + url
      });
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
  serviceAsset
    .deleteAsset(req.service, req.storage, req.asset)
    .then(result => helpers.json(res, result))
    .catch(error => helpers.error(res, error));
};
