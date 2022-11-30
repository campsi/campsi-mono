/* eslint-disable array-callback-return */
const CampsiService = require('../../lib/service');
const debug = require('debug')('campsi:audit');
const handlers = require('./handlers');
const utils = require('./utils.js');
const JournalService = require('./services/journal');

module.exports = class AuditService extends CampsiService {
  initialize() {
    debug('initialize audit service');
    this.createLog = this.createLog.bind(this);
    this.setupRoutes = this.setupRoutes.bind(this);

    const service = this;

    const schema = utils.validationSchema();

    const validator = { validator: { $jsonSchema: schema }, validationAction: 'warn' };

    this._journalService = JournalService;

    const ret = new Promise(resolve => {
      this.server.db
        .createCollection(utils.getCollectionName(), validator)
        .then(res => {
          this.setupRoutes(service);
          resolve();
        })
        .catch(err => {
          if (err.codeName === 'NamespaceExists') {
            this.setupRoutes(service);
          } else {
            console.log(err);
            debug("Can't create collection with supplied schema");
            debug(err);
          }

          resolve();
        });
    });

    return ret;
  }

  setupRoutes(service) {
    this.router.use('/', (req, _res, next) => {
      req.options = service.options;
      req.service = service;

      return next();
    });

    this.router.get('/log', handlers.getLog);
    this.router.post('/log', handlers.createLogEntry);
  }

  createLog(body) {
    JournalService.createAuditEntry(this.server.db, body, this.options);
  }
};