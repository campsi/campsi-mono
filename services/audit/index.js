/* eslint-disable array-callback-return */
const CampsiService = require('../../lib/service');
const debug = require('debug')('campsi:audit');
const handlers = require('./handlers');
const utils = require('./utils.js');
const JournalService = require('./services/journal');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const ajvErrors = require('ajv-errors');

module.exports = class AuditService extends CampsiService {
  initialize() {
    debug('initialize audit service');
    this.createLog = this.createLog.bind(this);
    this.setupRoutes = this.setupRoutes.bind(this);
    this.setupSchemaValidation = this.setupSchemaValidation.bind(this);

    const service = this;

    this._journalService = JournalService;

    this.db.collection(utils.getCollectionName(this.options)).createIndex({ date: -1 });

    if (
      Object.prototype.toString.call(this.options.ttlIndex) === '[object Object]' &&
      typeof this.options.ttlIndex.field === 'string' &&
      Number.isInteger(this.options.ttlIndex.expireAfterSeconds) &&
      this.options.ttlIndex.expireAfterSeconds >= 0
    ) {
      this.db
        .collection(utils.getCollectionName(this.options))
        .createIndex({ [this.options.ttlIndex.field]: 1 }, { expireAfterSeconds: this.options.ttlIndex.expireAfterSeconds });
    }

    return Promise.all(
      Object.entries(service.options.resources).map(async ([key, resource]) => {
        const schema = await utils.validationSchema(service, resource);
        this.setupSchemaValidation(resource, schema);
      })
    ).then(() => this.setupRoutes(service));
  }

  setupSchemaValidation(resource, schema) {
    const ajvReader = new Ajv({ allErrors: true, useAssign: true, strictTuples: false, strict: false });
    ajvErrors(ajvReader);
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

  async createLog(body) {
    await JournalService.createAuditEntry(this.server.db, body, this.options);
  }
};
