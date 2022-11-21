/* eslint-disable array-callback-return */
const CampsiService = require('../../lib/service');
const debug = require('debug')('campsi:audit');
const handlers = require('./handlers');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const csdAssign = require('../../lib/keywords/csdAssign');
const csdVisibility = require('../../lib/keywords/csdVisibility');
const $RefParser = require('json-schema-ref-parser');
const async = require('async');
const param = require('./param');

module.exports = class AuditService extends CampsiService {
  initialize() {
    debug('initialize audit service');
    const service = this;
    const server = this.server;

    this.router.use('/', (req, _res, next) => {
      req.options = service.options;
      req.service = service;

      return next();
    });

    this.router.param('resource', param.attachResource(service.options));
    this.router.get('/', handlers.getResources);
    this.router.getAsync('/log/', handlers.getLog);
    this.router.postAsync('/log/', handlers.createLogEntry);

    return new Promise(resolve => {
      const ajvWriter = new Ajv({ useAssign: true, strictTuples: false, strict: false });
      csdAssign(ajvWriter);
      addFormats(ajvWriter);
      const ajvReader = new Ajv({ useVisibility: true, strictTuples: false, strict: false });
      csdVisibility(ajvReader);
      addFormats(ajvReader);

      async.eachOf(
        service.options.resources,
        function (resource, name, cb) {
          Object.assign(resource, service.options.classes[resource.class]);
          resource.collection = server.db.collection(`audit.${service.path}`);
          $RefParser
            .dereference(service.config.optionsBasePath + '/', resource.schema, {})
            .then(function (schema) {
              resource.schema = schema;
              resource.validate = ajvWriter.compile(schema);
              resource.filter = ajvWriter.compile(schema);
              cb();
            })
            .catch(function (error) {
              debug(error);
              cb();
            });
        },
        resolve
      );
    });
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
