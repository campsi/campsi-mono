const aws = require('aws-sdk');
const AssetStorage = require('../storage');
const { PassThrough } = require('stream');

/**
 * @typedef S3AssetStorageOptions
 * @property {Object} [credentials]
 * @property {String} dataPath
 * @property {String} bucket
 */

class S3AssetStorage extends AssetStorage {
  /**
   * @param {S3AssetStorageOptions} options
   */
  constructor (options) {
    super(options);
    if (this.options.credentials) {
      aws.config.update({
        accessKeyId: this.options.credentials.accessKeyId,
        secretAccessKey: this.options.credentials.secretAccessKey,
        region: this.options.credentials.region
      });
    }
  }

  get dataPath () {
    return this.options.dataPath;
  }

  store (file) {
    return new Promise(resolve => {
      resolve(this.createPassThrough(file));
    });
  }

  getKey (file) {
    const now = new Date();
    let month = now.getMonth() + 1;
    month = (month < 10) ? '0' + month : month.toString();
    return now.getFullYear().toString() + '/' + month + '/' + file.originalName;
  }

  createPassThrough (file) {
    const getPublicAssetURL = this.options.getPublicAssetURL;
    const getKey = this.getKey;
    const s3 = new aws.S3({ params: { Bucket: this.options.bucket } });
    const bucket = this.options.bucket;
    let buffer = Buffer.alloc(0);
    let len = 0;
    return new PassThrough()
      .on('data', chunk => {
        len += chunk.length;
        buffer = Buffer.concat([buffer, chunk], len);
      })
      .on('finish', function streamBuffered () {
        const self = this;
        s3.upload({
          Bucket: bucket,
          Key: getKey(file),
          ContentType: 'application/octet-stream',
          ContentLength: file.size,
          Body: buffer
        })
          .on('httpUploadProgress', function (ev) {
            if (ev.total) file.uploadedSize = ev.total;
          })
          .send((err, data) => {
            if (err) {
              return self.emit('uploadError', err);
            }
            file.s3 = data;
            file.url =
              typeof getPublicAssetURL === 'function'
                ? getPublicAssetURL(data)
                : data.Location;
            self.emit('uploadSuccess', file);
          });
      });
  }

  deleteAsset (file) {
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

  getAssetURL (asset) {
    return asset.url;
  }

  streamAsset (asset) {
    const s3 = new aws.S3({ params: { Bucket: this.options.bucket } });
    return s3
      .getObject({
        Bucket: asset.s3.Bucket,
        Key: asset.s3.Key
      })
      .createReadStream();
  }
}

module.exports = S3AssetStorage;
