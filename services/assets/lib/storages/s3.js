/* eslint-disable node/no-unsupported-features/es-syntax */
const { S3Client, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
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
  constructor(options) {
    super(options);
    this.s3 = new S3Client({
      region: this.options.region || this.options.credentials?.region, // handle old config
      credentials: this.options.credentials,
      maxAttempts: this.options.maxAttempts || 3
    });
  }

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

    const { s3 } = this;
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
      .on('finish', async function streamBuffered() {
        const self = this;
        try {
          const upload = new Upload({
            client: s3,
            params: {
              Bucket: bucket,
              Key: getKey(file, false),
              ContentType: file.detectedMimeType || 'application/octet-stream',
              ContentLength: file.size,
              Body: buffer
            }
          }).on('httpUploadProgress', function (ev) {
            if (ev.total) file.uploadedSize = ev.total;
          });

          const data = await upload.done();
          file.s3 = data;
          file.url =
            typeof getPublicAssetURL === 'function'
              ? getPublicAssetURL({ key: data?.Key, ...data, encodedKey: getKey(file) }) // key: handle old return value
              : data.Location;
          self.emit('uploadSuccess', file);
        } catch (err) {
          return self.emit('uploadError', err);
        }
      });
  }

  async deleteAsset(file) {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.options.bucket,
        Key: file.key
      })
    );
  }

  getAssetURL(asset) {
    return asset.url;
  }

  async streamAsset(asset) {
    const data = await this.s3.send(
      new GetObjectCommand({
        Bucket: asset.s3.Bucket,
        Key: asset.s3.Key
      })
    );
    return data.Body;
  }
}

module.exports = S3AssetStorage;
