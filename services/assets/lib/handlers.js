/* eslint-disable node/no-unsupported-features/es-syntax */
/* eslint-disable node/no-unsupported-features/node-builtins */
/* eslint-disable node/no-unpublished-require */
const debug = require('debug')('campsi:service:assets');
const helpers = require('../../../lib/modules/responseHelpers');
const http = require('http');
const serviceAsset = require('./services/asset');
const buildLink = require('../../../lib/modules/buildLink');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tempDir = os.tmpdir();

module.exports.postAssets = function postAssets(req, res) {
  // TODO create our own structure for files, be independent from multer
  serviceAsset
    .createAsset(req.service, req.files, req.user, req.headers)
    .then(data => helpers.json(res, data))
    .catch(() => helpers.error(res))
    .finally(() => {
      if (req.unlinkLocalFileAfterUpload) {
        debug(`remove local temp file ${req.unlinkLocalFileAfterUpload}`);
        fs.unlinkSync(req.unlinkLocalFileAfterUpload);
      }
    });
};

module.exports.copyRemote = function copyRemote(req, res, next) {
  if (!req.body.url) {
    return helpers.badRequest(res, {
      message: 'Request payload must contain a `url` field'
    });
  }
  try {
    const url = new URL(req.body.url);
    const filename = url.pathname.substring(url.pathname.lastIndexOf('/') + 1);
    const clientReportedFileExtension = filename.substring(filename.lastIndexOf('.'));
    https
      .get(req.body.url, fetchRes => {
        if (fetchRes.statusCode !== 200) {
          return helpers.badRequest(res, {
            message: 'Asset copy failed'
          });
        }

        const fileProps = {
          filename,
          clientReportedFileExtension,
          clientReportedMimeType: fetchRes.headers['content-type'],
          detectedMimeType: fetchRes.headers['content-type']
        };
        // Chunked response do not contain the content length.
        // As a result, we can't just passthrough them to S3,
        // and we need to write them locally.
        if (!fetchRes.headers['content-length']) {
          const tempFilePath = path.resolve(tempDir, `copyRemote--${crypto.randomBytes(16).toString('hex')}`);
          const localWriteStream = fs.createWriteStream(tempFilePath, {
            flags: 'w'
          });
          fetchRes.pipe(localWriteStream);
          localWriteStream.on('finish', () => {
            localWriteStream.close();
            const localReadString = fs.createReadStream(tempFilePath);
            const stats = fs.statSync(tempFilePath);
            req.files = [
              {
                stream: localReadString,
                size: stats.size,
                ...fileProps
              }
            ];
            // we store the local file path in order to unlink it afterwards
            req.unlinkLocalFileAfterUpload = tempFilePath;
            next();
          });
        } else {
          req.files = [
            {
              stream: fetchRes,
              size: parseInt(fetchRes.headers['content-length']),
              ...fileProps
            }
          ];
          next();
        }
      })
      .on('error', function(e) {
        helpers.badRequest(res, e);
      });
  } catch (e) {
    return helpers.badRequest(res, e);
  }
};

module.exports.getAssets = function getAssets(req, res) {
  const pagination = {};
  pagination.perPage = req.query.perPage;
  pagination.page = req.query.page;
  pagination.infinite = req.query.pagination && `${req.query.pagination}`.toLowerCase() === 'false';

  serviceAsset
    .getAssets(req.service, pagination, req.query.sort)
    .then(data => {
      const links = [];
      Object.entries(data.nav).forEach(([rel, page]) => {
        if (!!page && page !== data.page) {
          links.push(`<${buildLink(req, page, ['perPage', 'sort'])}>; rel="${rel}"`);
        }
      });

      const headers = {};
      if (!pagination.infinite) {
        headers['X-Total-Count'] = data.count;
        headers['X-Page'] = data.page;
        headers['X-Per-Page'] = data.perPage;
        headers['X-Last-Page'] = data.nav.last;
        const headersKeys = ['X-Total-Count', 'X-Page', 'X-Per-Page', 'X-Last-Page'];
        if (links.length) {
          headers.Link = links.join(', ');
          headersKeys.push('Link');
        }
        headers['Access-Control-Expose-Headers'] = headersKeys.join(', ');
      }

      return helpers.json(res, data.assets, headers);
    })
    .catch(() => {
      helpers.error(res);
    });
};

module.exports.sendLocalFile = function sendLocalFile(req, res) {
  res.sendFile(path.join(req.service.options.storages.local.dataPath, req.params[0]));
};

module.exports.streamAsset = function streamAsset(req, res) {
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
      function(newRes) {
        const headers = newRes.headers;
        headers['Content-Disposition'] = 'attachment; filename="{0}"'.format(req.asset.originalName);
        headers['Content-Type'] = req.asset.clientReportedMimeType;
        headers['Content-Length'] = req.asset.size;
        headers.Connection = 'keep-alive';
        res.writeHead(newRes.statusCode, headers);
        newRes.pipe(res);
      }
    )
    .on('error', function(err) {
      debug('Streaming error: %s', err);
      res.statusCode = 500;
      res.json({
        error: err,
        message: 'Streaming error, could not forward to ' + url
      });
    });

  req.pipe(newReq);
};

module.exports.getAssetMetadata = function getAssetMetadata(req, res) {
  res.json(req.asset);
};

/**
 * @param {ExpressRequest} req
 * @param res
 */
module.exports.deleteAsset = function deleteAsset(req, res) {
  serviceAsset
    .deleteAsset(req.service, req.storage, req.asset)
    .then(result => helpers.json(res, result))
    .catch(error => helpers.error(res, error));
};
