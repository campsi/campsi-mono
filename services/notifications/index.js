/* eslint-disable array-callback-return */
const CampsiService = require('../../lib/service');
const debug = require('debug')('campsi:notifications');
const handlers = require('./handlers');
const Ajv = require('ajv');
const ajvErrors = require('ajv-errors');
const addFormats = require('ajv-formats');
const csdAssign = require('../../lib/keywords/csdAssign');
const csdVisibility = require('../../lib/keywords/csdVisibility');
const $RefParser = require('json-schema-ref-parser');
const async = require('async');
const param = require('./param');

module.exports = class NotificationsService extends CampsiService {
  async initialize() {
    debug('initialize Notifications service');
    const service = this;

    this.router.use('/', (req, _res, next) => {
      req.options = service.options;
      req.service = service;

      return next();
    });

    this.router.param('resource', param.attachResource(service.options));
    this.router.get('/', handlers.getResources);
    this.router.get('/:resource/', handlers.getNotifications);
    this.router.get('/:resource/:id', handlers.getNotification);
    this.router.post('/:resource/', handlers.createNotification);
    this.router.put('/:resource/:id', handlers.updateNotification);
    this.router.patch('/:resource/:id', handlers.patchNotification);
    this.router.delete('/:resource/:id', handlers.deleteNotification);

    this.attachCollectionToResources();
    await this.addSchemaValidationToResources();

    return super.initialize();
  }

  attachCollectionToResources() {
    for (const resource of Object.values(this.options.resources)) {
      resource.collection = this.db.collection(`notifications.${this.path}`);
    }
  }

  async addSchemaValidationToResources() {
    const ajvWriter = new Ajv({ allErrors: true, useAssign: true, strictTuples: false, strict: false });
    ajvErrors(ajvWriter);
    csdAssign(ajvWriter);
    addFormats(ajvWriter);
    const ajvReader = new Ajv({ allErrors: true, useVisibility: true, strictTuples: false, strict: false });
    ajvErrors(ajvReader);
    csdVisibility(ajvReader);
    addFormats(ajvReader);
    for (const resource of Object.values(this.options.resources)) {
      const schema = await $RefParser.dereference(this.config.optionsBasePath + '/', resource.schema, {});
      resource.schema = schema;
      resource.validate = ajvWriter.compile(schema);
      resource.filter = ajvWriter.compile(schema);
    }
  }

  describe() {
    const desc = super.describe();
    desc.resources = {};
    desc.classes = this.options.classes;
    Object.entries(this.options.resources).map(([path, resource]) => {
      desc.resources[path] = {
        label: resource.label,
        name: resource.path,
        class: resource.class,
        schema: resource.schema
      };
    });
    return desc;
  }
};
