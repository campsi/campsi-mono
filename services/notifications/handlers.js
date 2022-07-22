const helpers = require('../../lib/modules/responseHelpers');
const debug = require('debug')('campsi:notifications');
const createObjectId = require('../../lib/modules/createObjectId');

module.exports.getNotifications = async function (req, res) {
  try {
    debug('getNotifications :: Start');

    const notifications = await req.service.collection.find().sort({ createdAt: -1 }).toArray();

    debug('getNotifications :: End');

    return helpers.json(res, { success: true, notifications });
  } catch (err) {
    debug(`getNotifications :: Err :: ${err.message} :: ${err.stack}`);

    return helpers.error(res, { message: err.message, stack: err.stack });
  }
};

module.exports.getNotification = async function (req, res) {
  try {
    debug(`getNotification :: Start :: ${req.params.id}`);

    const notificationId = createObjectId(req.params.id);

    const notification = await req.service.collection.findOne({ _id: notificationId });

    if (!notification) {
      debug(`getNotification :: Error :: Notification Not Found :: ${notificationId}`);
      return helpers.notFound(res);
    }

    debug(`getNotification :: End :: ${req.params.id}`);

    return helpers.json(res, { success: true, notification });
  } catch (err) {
    debug(`getNotification :: Err :: ${err.message} :: ${err.stack}`);

    return helpers.error(res, { message: err.message, stack: err.stack });
  }
};

module.exports.createNotification = async function (req, res) {
  try {
    debug(`createNotification :: Start :: ${req.body}`);

    const notification = { createdAt: new Date(), createdBy: null, modifiedAt: null, modifiedBy: null, data: req.body };

    const { insertedId } = await req.service.collection.insertOne(notification);

    req.service.emit('notification/created', { ...notification, _id: insertedId });

    debug(`createNotification :: insertedNotification :: ${insertedId}`);

    debug('createNotification :: End');

    return helpers.json(res, { success: true, _id: insertedId });
  } catch (err) {
    debug(`createNotification :: Error :: ${err.message} :: ${err.stack}`);

    return helpers.error(res, { message: err.message, stack: err.stack });
  }
};

module.exports.deleteNotification = async function (req, res) {
  try {
    debug(`deleteNotification :: Start :: ${req.params.id}`);

    const notificationId = createObjectId(req.params.id);

    const { deletedCount } = await req.service.collection.deleteOne({ _id: notificationId });

    if (deletedCount === 0) {
      debug(`deleteNotification :: Error :: Notification Not Found :: ${notificationId}`);
      return helpers.notFound(res, deletedCount);
    }

    req.service.emit('notification/deleted', { _id: notificationId });

    debug('deleteNotification :: End');
    return helpers.json(res, { success: true });
  } catch (err) {
    debug(`deleteNotification :: Err :: ${err.message} :: ${err.stack}`);

    return helpers.error(res, { message: err.message, stack: err.stack });
  }
};

module.exports.updateNotification = async function (req, res) {
  try {
    debug(`updateNotification :: Start :: ${req.params.id}`);

    const notificationId = createObjectId(req.params.id);

    const ops = {
      $set: {
        modifiedAt: new Date(),
        modifiedBy: null,
        data: req.body
      }
    };

    const { value: updatedNotification } = await req.service.collection.findOneAndUpdate({ _id: notificationId }, ops, {
      returnDocument: 'after'
    });

    if (!updatedNotification) {
      debug(`updateNotification :: Error :: Notification Not Found :: ${notificationId}`);
      return helpers.notFound(res);
    }

    req.service.emit('notification/updated', { ...updatedNotification });

    debug('updateNotification :: End');
    return helpers.json(res, { success: true, notification: updatedNotification });
  } catch (err) {
    debug(`updateNotification :: Err :: ${err.message} :: ${err.stack}`);

    return helpers.error(res, { message: err.message, stack: err.stack });
  }
};

module.exports.patchNotification = async function (req, res) {
  try {
    debug(`patchNotification :: Start :: ${req.params.id}`);

    const notificationId = createObjectId(req.params.id);

    const ops = {
      $set: {
        modifiedAt: new Date(),
        modifiedBy: null
      },
      $unset: {}
    };

    for (const [key, value] of Object.entries(req.body)) {
      const operator = value === null || value === undefined ? '$unset' : '$set';
      ops[operator][['data', key].join('.')] = value;
    }

    if (Object.keys(ops.$unset).length === 0) {
      delete ops.$unset;
    }

    const { value: updatedNotification } = await req.service.collection.findOneAndUpdate({ _id: notificationId }, ops, {
      returnDocument: 'after'
    });

    if (!updatedNotification) {
      debug(`patchNotification :: Error :: Notification Not Found :: ${notificationId}`);
      return helpers.notFound(res);
    }

    req.service.emit('notification/patched', { ...updatedNotification });

    debug('patchNotification :: End');
    return helpers.json(res, { success: true, notification: updatedNotification });
  } catch (err) {
    debug(`patchNotification :: Err :: ${err.message} :: ${err.stack}`);

    return helpers.error(res, { message: err.message, stack: err.stack });
  }
};
