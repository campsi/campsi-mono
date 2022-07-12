const CampsiService = require('../../lib/service');
const debug = require('debug')('campsi:notifications');

module.exports = class NotificationsService extends CampsiService {
  initialize() {
    debug('initialize Notifications service');

    this.collection = this.db.collection('notifications');

    this.router.use('/', (req, _res, next) => {
      req.options = this.options;
      req.service = this;

      return next();
    });

    return super.initialize();
  }

  describe() {
    const desc = super.describe();

    return desc;
  }
};
