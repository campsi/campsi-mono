const CampsiService = require('../../lib/service');
const debug = require('debug')('campsi:notifications');
const handlers = require('./handlers');

module.exports = class NotificationsService extends CampsiService {
  initialize() {
    debug('initialize Notifications service');

    this.collection = this.db.collection('notifications');

    this.router.use('/', (req, _res, next) => {
      req.options = this.options;
      req.service = this;

      return next();
    });

    this.router.get('/', handlers.getNotifications);
    this.router.get('/:id', handlers.getNotification);
    this.router.post('/', handlers.createNotification);
    this.router.put('/:id', handlers.updateNotification);
    this.router.patch('/:id', handlers.patchNotification);
    this.router.delete('/:id', handlers.deleteNotification);

    return super.initialize();
  }

  describe() {
    const desc = super.describe();

    return desc;
  }
};
