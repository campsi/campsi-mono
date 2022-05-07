const async = require('async');
const debug = require('debug')('campsi:service:assets');
const paginateCursor = require('../../../../lib/modules/paginateCursor');
const sortCursor = require('../../../../lib/modules/sortCursor');
const { ObjectId } = require('mongodb');

module.exports.getAssets = function (service, pagination, sort) {
  return new Promise((resolve, reject) => {
    const cursor = service.collection.find({});
    let result = {};
    paginateCursor(cursor, pagination)
      .then(info => {
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
        sortCursor(cursor, sort);
        return cursor.toArray();
      })
      .then(docs => {
        result.assets = docs;
        resolve(result);
      })
      .catch(err => {
        debug('Get assets error: %s', err.message);
        reject(err);
      });
  });
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

        function onError (err) {
          debug('Post asset error: %s', err);
          file.error = true;
          cb();
        }

        function onSuccess () {
          file.stream.destroy();
          delete file.stream;
          delete file.fieldname;
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
            file.stream
              .pipe(storageStream)
              .on('uploadSuccess', onSuccess)
              .on('uploadError', onError);
          })
          .catch(onError);
      },
      () => {
        files = files.map(file => {
          // we delete the stream in order to prevent infinite loop
          // while BSON serializing the object
          return { _id: new ObjectId(), ...file, stream: undefined };
        });
        service.collection.insertMany(files).then(() => {
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
