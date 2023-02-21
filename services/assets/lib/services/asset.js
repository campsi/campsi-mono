/* eslint-disable node/no-unsupported-features/es-syntax */
/* eslint-disable node/no-unpublished-require */
const async = require('async');
const debug = require('debug')('campsi:service:assets');
const { paginateWithCount } = require('../../../../lib/modules/paginateCursor');
const sortCursor = require('../../../../lib/modules/sortCursor');
const { ObjectId } = require('mongodb');

module.exports.getAssets = async function (service, pagination, sort) {
  try {
    const docsCount = await service.collection.countDocuments({});
    const result = {};

    const info = paginateWithCount(docsCount, pagination);
    result.count = info.count;
    result.page = info.page;
    result.perPage = info.perPage;
    result.nav = {};
    result.nav.first = 1;
    result.nav.last = info.lastPage;
    if (info.page > 1) {
      result.nav.previous = info.page - 1;
    }
    if (info.page < info.lastPage) {
      result.nav.next = info.page + 1;
    }
    const findOptions = { limit: info.limit, skip: info.skip };
    if (sort) {
      findOptions.sort = sortCursor(undefined, sort, undefined, true);
    }
    result.assets = await service.collection.find({}, findOptions).toArray();
    return result;
  } catch (err) {
    debug('Get assets error: %s', err.message);
    throw err;
  }
};

module.exports.createAsset = function (service, files, user, headers) {
  return new Promise((resolve, reject) => {
    if (!files || !files.length) {
      return reject(new Error("Can't find file"));
    }

    async.each(
      files,
      (file, cb) => {
        const storage = service.options.getStorage(file, user, headers);

        function onError(err) {
          debug('Post asset error: %s', err);
          file.error = true;
          cb();
        }

        function onSuccess() {
          file.stream.destroy();
          cb();
        }

        if (user) {
          file.createdBy = user._id;
        }

        file.createdAt = new Date();
        file.createdFrom = {
          origin: headers.origin,
          referer: headers.referer,
          ua: headers['user-agent']
        };

        file.storage = storage.options.name;

        storage
          .store(file)
          .then(storageStream => {
            file.stream.pipe(storageStream).on('uploadSuccess', onSuccess).on('uploadError', onError);
          })
          .catch(onError);
      },
      () => {
        files = files.map(file => {
          // we delete the stream in order to prevent infinite loop
          // while BSON serializing the object
          delete file.stream;
          delete file.fieldname;
          delete file.data;
          delete file.name;
          delete file.encoding;
          delete file.mimetype;
          delete file.storage;
          delete file.truncated;
          return { _id: new ObjectId(), ...file };
        });
        service.collection.insertMany(files).then(result => {
          resolve(files);
        });
      }
    );
  });
};

module.exports.deleteAsset = function (service, storage, asset) {
  return new Promise((resolve, reject) => {
    storage
      .deleteAsset(asset)
      .then(() => service.collection.deleteOne({ _id: asset._id }))
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
};
