/* eslint-disable array-callback-return */
const CampsiService = require('../../../lib/service');
const param = require('./param');
const handlers = require('./handlers');
const async = require('async');
const Ajv = require('ajv');
const ajvErrors = require('ajv-errors');
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

    const validateWriteAccess = (req, res, next) => {
      if (typeof this.options.validateWriteAccess === 'function') {
        return this.options.validateWriteAccess(req, res, next);
      }
      return next();
    };

    const additionalMiddlewares = (req, res, next) => {
      const method = req.customMethod || req.method;
      if (typeof req.resource?.additionalMiddlewares?.[method] !== 'function') {
        return next();
      }
      return req.resource?.additionalMiddlewares[method](req, res, next);
    };

    this.router.use('/', (req, res, next) => {
      req.options = service.options;
      req.service = service;
      next();
    });

    this.router.delete('/[:]soft-delete', handlers.softDelete);

    this.router.param('resource', param.attachResource(service.options));
    this.router.get('/', handlers.getResources);
    this.router.get('/:resource', additionalMiddlewares, handlers.getDocuments);
    this.router.post('/:resource/documents[:]get', additionalMiddlewares, handlers.getDocuments);
    this.router.post('/:resource/:id/locks', additionalMiddlewares, handlers.lockDocument);
    this.router.get('/:resource/:id/locks', additionalMiddlewares, handlers.getLocks);
    this.router.get('/:resource/:id/users', additionalMiddlewares, handlers.getDocUsers);
    this.router.post('/:resource/:id/users', additionalMiddlewares, handlers.postDocUser);
    this.router.delete('/:resource/:id/users/:user', additionalMiddlewares, handlers.delDocUser);
    this.router.post('/:resource/:id/:state/locks', additionalMiddlewares, handlers.lockDocument);
    this.router.get('/:resource/:id/:state', additionalMiddlewares, handlers.getDoc);
    this.router.get('/:resource/:id', additionalMiddlewares, handlers.getDoc);
    this.router.post('/:resource/:state', additionalMiddlewares, validateWriteAccess, handlers.postDoc);
    this.router.post('/:resource', additionalMiddlewares, validateWriteAccess, handlers.postDoc);
    this.router.put('/:resource/:id/state', additionalMiddlewares, validateWriteAccess, handlers.putDocState);
    this.router.put('/:resource/:id/:state', additionalMiddlewares, validateWriteAccess, handlers.putDoc);
    this.router.put('/:resource/:id', additionalMiddlewares, validateWriteAccess, handlers.putDoc);
    this.router.patch('/:resource/:id', additionalMiddlewares, validateWriteAccess, handlers.patchDoc);
    this.router.delete('/:resource/:id', additionalMiddlewares, handlers.delDoc);
    this.router.delete('/:resource/:id/:state', additionalMiddlewares, handlers.delDoc);
    this.router.delete('/:resource/:id/locks/:lock', additionalMiddlewares, handlers.deleteLock);

    return new Promise(resolve => {
      const ajvWriter = new Ajv({ allErrors: true, useAssign: true, strictTuples: false, strict: false });
      ajvErrors(ajvWriter);
      addFormats(ajvWriter);
      csdAssign(ajvWriter);
      const ajvReader = new Ajv({ allErrors: true, useVisibility: true, strictTuples: false, strict: false });
      ajvErrors(ajvReader);
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
