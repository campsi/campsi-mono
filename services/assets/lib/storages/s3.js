/* eslint-disable node/no-unsupported-features/es-syntax */
const aws = require('aws-sdk');
const AssetStorage = require('../storage');
const { PassThrough } = require('stream');
const { randomUUID: uuid } = require('crypto');
const debug = require('debug')('campsi:assets:s3');
/**
 * @typedef S3AssetStorageOptions
 * @property {Object} [credentials]
 * @property {String} dataPath
 * @property {String} bucket
 */

class S3AssetStorage extends AssetStorage {
  get dataPath() {
    return this.options.dataPath;
  }

  store(file) {
    return new Promise(resolve => {
      resolve(this.createPassThrough(file));
    });
  }

  getKey(file) {
    const now = new Date();
    let month = now.getMonth() + 1;
    month = month < 10 ? '0' + month : month.toString();
    const prefix = uuid();
    return `${now.getFullYear().toString()}/${month}/${prefix}${file.clientReportedFileExtension}`;
  }

  createPassThrough(file) {
    const getPublicAssetURL = this.options.getPublicAssetURL;
    const s3 = new aws.S3({ ...this.options.credentials });
    const bucket = this.options.bucket;
    // will be used later in a scoped context, do not remove
    const getKey = this.getKey;
    let buffer = Buffer.alloc(0);
    let len = 0;
    return new PassThrough()
      .on('data', chunk => {
        len += chunk.length;
        buffer = Buffer.concat([buffer, chunk], len);
      })
      .on('error', function handleError(err) {
        debug(err);
      })
      .on('finish', function streamBuffered() {
        const self = this;
        s3.upload({
          Bucket: bucket,
          Key: getKey(file, false),
          ContentType: file.detectedMimeType || 'application/octet-stream',
          ContentLength: file.size,
          Body: buffer
        })
          .on('httpUploadProgress', function(ev) {
            if (ev.total) file.uploadedSize = ev.total;
          })
          .send((err, data) => {
            if (err) {
              return self.emit('uploadError', err);
            }
            file.s3 = data;
            file.url =
              typeof getPublicAssetURL === 'function' ? getPublicAssetURL({ ...data, encodedKey: getKey(file) }) : data.Location;
            self.emit('uploadSuccess', file);
          });
      });
  }

  deleteAsset(file) {
    return new Promise((resolve, reject) => {
      this.s3.deleteObject(
        {
          Bucket: this.options.bucket,
          Key: file.key
        },
        err => (err ? reject(err) : resolve())
      );
    });
  }

  getAssetURL(asset) {
    return asset.url;
  }

  streamAsset(asset) {
    const s3 = new aws.S3({ ...this.options.credentials });
    return s3
      .getObject({
        Bucket: asset.s3.Bucket,
        Key: asset.s3.Key
      })
      .createReadStream();
  }
}

module.exports = S3AssetStorage;
