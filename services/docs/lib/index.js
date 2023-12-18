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
      if (typeof req.resource?.additionalMiddlewares?.[req.method] !== 'function') {
        return next();
      }
      return req.resource?.additionalMiddlewares[req.method](req, res, next);
    };

    this.router.use('/', (req, res, next) => {
      req.options = service.options;
      req.service = service;
      next();
    });

    this.router.delete(
      // #swagger.tags = ['DOCSERVICE']
      // #swagger.ignore = always
      '/[:]soft-delete',
      handlers.softDelete
    );

    this.router.param(
      // #swagger.tags = ['DOCSERVICE']
      // #swagger.ignore = always
      'resource',
      param.attachResource(service.options)
    );
    this.router.get(
      '/',
      // #swagger.tags = ['DOCSERVICE']
      // #swagger.ignore = always
      handlers.getResources
    );
    this.router.get(
      // #swagger.tags = ['DOCSERVICE']
      // #swagger.ignore = true
      '/:resource',
      additionalMiddlewares,
      handlers.getDocuments
    );
    this.router.post(
      '/:resource/:id/locks',
      // #swagger.tags = ['DOCSERVICE']
      // #swagger.ignore = true
      additionalMiddlewares,
      handlers.lockDocument
    );
    this.router.get(
      '/:resource/:id/locks',
      // #swagger.ignore = true
      // #swagger.tags = ['DOCSERVICE']
      additionalMiddlewares,
      handlers.getLocks
    );
    this.router.get(
      // #swagger.ignore = true
      // #swagger.tags = ['DOCSERVICE'],
      '/:resource/:id/users',
      additionalMiddlewares,
      handlers.getDocUsers
    );
    this.router.post(
      // #swagger.tags = ['DOCSERVICE'],
      // #swagger.ignore = true
      '/:resource/:id/users',
      additionalMiddlewares,
      handlers.postDocUser
    );
    this.router.delete(
      /* #swagger.tags = ['DOCSERVICE'],
         #swagger.ignore = true
      */
      '/:resource/:id/users/:user',
      additionalMiddlewares,
      handlers.delDocUser
    );
    this.router.post(
      '/:resource/:id/:state/locks',
      // #swagger.ignore = true
      additionalMiddlewares,
      handlers.lockDocument
    );
    this.router.get(
      // #swagger.tags = ['DOCSERVICE']
      // #swagger.ignore = true
      '/:resource/:id/:state',
      additionalMiddlewares,
      handlers.getDoc
    );
    this.router.get(
      /*
        #swagger.tags = ['DOCSERVICE'],
        #swagger.security = [{
          "bearerAuth": []
        }]
        #swagger.summary = 'DOCS_GET_RESOURCE_SUMMARY'
        #swagger.parameters['resource'] = {
          hide: true
        }
        #swagger.parameters['id'] = {
          in: 'path',
          description: "DOCS_GET_ID_PARAM_DESCRIPTION"
        }
        #swagger.responses[200] = {
          description: "DOCS_GET_RESPONSE_DESCRIPTION",
          content: {
            "application/json": {
              schema:{
                $ref: "DOCS_GET_RESPONSE_SCHEMA"
              }
            }
          }
        }
        #swagger.responses[404] = {
          description: "DOCS_GET_RESPONSE_404_DESCRIPTION",
          content: {
            "application/json": {
              schema:{
                $ref: "DOCS_GET_RESPONSE_404_SCHEMA"
              }
            }
          }
        }
        */

      '/:resource/:id',
      additionalMiddlewares,
      handlers.getDoc
    );
    this.router.postAsync(
      // #swagger.tags = ['DOCSERVICE'],
      // #swagger.ignore = true
      '/:resource/:state',
      additionalMiddlewares,
      validateWriteAccess,
      handlers.postDoc
    );
    this.router.post(
      /*
        #swagger.tags = ['DOCSERVICE'],
        #swagger.security = [{
          "bearerAuth": []
        }]
        #swagger.summary = 'DOCS_POST_RESOURCE_SUMMARY'
        #swagger.parameters['resource'] = {
          hide: true
        }
        #swagger.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "DOCS_POST_REQUEST_SCHEMA" }
            }
          }
        }
        #swagger.responses[200] = {
          description: "DOCS_POST_RESPONSE_DESCRIPTION",
          content: {
            "application/json": {
              schema:{
                $ref: "DOCS_POST_RESPONSE_SCHEMA"
              }
            }
          }
        }
        */
      '/:resource',
      additionalMiddlewares,
      validateWriteAccess,
      handlers.postDoc
    );
    this.router.put(
      // #swagger.tags = ['DOCSERVICE'],
      // #swagger.ignore = true
      '/:resource/:id/state',
      additionalMiddlewares,
      validateWriteAccess,
      handlers.putDocState
    );
    this.router.putAsync(
      // #swagger.tags = ['DOCSERVICE'],
      // #swagger.ignore = true
      '/:resource/:id/:state',
      additionalMiddlewares,
      validateWriteAccess,
      handlers.putDoc
    );
    this.router.putAsync(
      /*
        #swagger.tags = ['DOCSERVICE'],
        #swagger.security = [{
          "bearerAuth": []
        }]
        #swagger.summary = 'DOCS_PUT_RESOURCE_ID_SUMMARY'
        #swagger.parameters['resource'] = {
          hide: true
        }
        #swagger.parameters['id'] = {
          in: 'path',
          description: "DOCS_PUT_ID_PARAM_DESCRIPTION"
        }
        #swagger.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "DOCS_PUT_WRITE_SCHEMA" }
            }
          }
        }
        #swagger.responses[200] = {
          description: "DOCS_PUT_RESPONSE_DESCRIPTION",
          content: {
            "application/json": {
              schema:{
                $ref: "DOCS_PUT_RESPONSE_SCHEMA"
              }
            }
          }
        }
        */
      '/:resource/:id',
      additionalMiddlewares,
      validateWriteAccess,
      handlers.putDoc
    );
    this.router.patch(
      // #swagger.tags = ['DOCSERVICE'],
      // #swagger.ignore = true
      '/:resource/:id',
      additionalMiddlewares,
      validateWriteAccess,
      handlers.patchDoc
    );
    this.router.delete(
      /*
        #swagger.tags = ['DOCSERVICE'],
        #swagger.security = [{
          "bearerAuth": []
        }]
        #swagger.summary = 'DOCS_DELETE_RESOURCE_SUMMARY'
        #swagger.parameters['id'] = {
          in: 'path',
          description: "DOCS_DELETE_ID_PARAM_DESCRIPTION"
        }
        #swagger.parameters['resource'] = {
          hide: true
        }
        #swagger.responses[200] = {
          description: "DOCS_DELETE_RESPONSE_DESCRIPTION",
          content: {
            "application/json": {
              schema:{
                $ref: "DOCS_DELETE_RESPONSE_SCHEMA"
              }
            }
          }
        }
        */
      '/:resource/:id',
      additionalMiddlewares,
      handlers.delDoc
    );
    this.router.delete(
      // #swagger.tags = ['DOCSERVICE'],
      // #swagger.ignore = true
      '/:resource/:id/:state',
      additionalMiddlewares,
      handlers.delDoc
    );
    this.router.delete(
      '/:resource/:id/locks/:lock',
      // #swagger.ignore = true
      additionalMiddlewares,
      handlers.deleteLock
    );

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
