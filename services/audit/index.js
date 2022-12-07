/* eslint-disable array-callback-return */
const CampsiService = require('../../lib/service');
const debug = require('debug')('campsi:audit');
const handlers = require('./handlers');
const utils = require('./utils.js');
const JournalService = require('./services/journal');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

module.exports = class AuditService extends CampsiService {
  initialize() {
    debug('initialize audit service');
    this.createLog = this.createLog.bind(this);
    this.setupRoutes = this.setupRoutes.bind(this);
    this.setupSchemaValidation = this.setupSchemaValidation.bind(this);

    const service = this;

    const schema = utils.validationSchema();

    this._journalService = JournalService;

    const ret = new Promise((resolve, reject) => {
      try {
        for (const [key, resource] of Object.entries(service.options.resources)) {
          this.setupSchemaValidation(resource, schema);
        }

        this.setupRoutes(service);

        resolve();
      } catch (ex) {
        reject(ex);
      }
    });

    return ret;
  }

  setupSchemaValidation(resource, schema) {
    const ajvReader = new Ajv({ useAssign: true, strictTuples: false, strict: false });
    addFormats(ajvReader, ['date-time']);

    try {
      resource.validate = ajvReader.compile(schema);
    } catch (ex) {
      console.log(ex);
    }
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
