/* eslint-disable array-callback-return */
const CampsiService = require('../../../lib/service');
const param = require('./param');
const handlers = require('./handlers');
const async = require('async');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const $RefParser = require('json-schema-ref-parser');
const debug = require('debug')('campsi:docs');
const format = require('string-format');
const csdAssign = require('../../../lib/keywords/csdAssign');
const csdVisibility = require('../../../lib/keywords/csdVisibility');

/* Todo
 * [ ] filter document fields based on query parameter fields
 * [ ] debug pagination
 */

format.extend(String.prototype);

module.exports = class DocsService extends CampsiService {
  initialize() {
    const service = this;
    const server = this.server;

    this.router.use('/', (req, res, next) => {
      req.options = service.options;
      req.service = service;
      next();
    });
    this.router.param('resource', param.attachResource(service.options));
    this.router.get('/', handlers.getResources);
    this.router.get('/:resource', handlers.getDocuments);
    this.router.post('/:resource/:id/locks', handlers.lockDocument);
    this.router.get('/:resource/:id/locks', handlers.getLocks);
    this.router.get('/:resource/:id/users', handlers.getDocUsers);
    this.router.post('/:resource/:id/users', handlers.postDocUser);
    this.router.delete('/:resource/:id/users/:user', handlers.delDocUser);
    this.router.post('/:resource/:id/:state/locks', handlers.lockDocument);
    this.router.get('/:resource/:id/:state', handlers.getDoc);
    this.router.get('/:resource/:id', handlers.getDoc);
    this.router.post('/:resource/:state', handlers.postDoc);
    this.router.post('/:resource', handlers.postDoc);
    this.router.put('/:resource/:id/state', handlers.putDocState);
    this.router.put('/:resource/:id/:state', handlers.putDoc);
    this.router.put('/:resource/:id', handlers.putDoc);
    this.router.patch('/:resource/:id', handlers.patchDoc);
    this.router.delete('/:resource/:id', handlers.delDoc);
    this.router.delete('/[:]soft-delete', handlers.softDelete);
    this.router.delete('/:resource/:id/:state', handlers.delDoc);
    this.router.delete('/:resource/:id/locks/:lock', handlers.deleteLock);
    return new Promise(resolve => {
      const ajvWriter = new Ajv({ useAssign: true, strictTuples: false, strict: false });
      addFormats(ajvWriter);
      csdAssign(ajvWriter);
      const ajvReader = new Ajv({ useVisibility: true, strictTuples: false, strict: false });
      addFormats(ajvReader);
      csdVisibility(ajvReader);
      async.eachOf(
        service.options.resources,
        function (resource, name, cb) {
          Object.assign(resource, service.options.classes[resource.class]);
          resource.collection = server.db.collection('docs.{0}.{1}'.format(service.path, name));
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
