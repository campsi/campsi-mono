/* eslint-disable array-callback-return */
const CampsiService = require('../../../lib/service');
const param = require('./param');
const handlers = require('./handlers');
const Ajv = require('ajv');
const ajvErrors = require('ajv-errors');
const addFormats = require('ajv-formats');
const $RefParser = require('json-schema-ref-parser');
const format = require('string-format');
const csdAssign = require('../../../lib/keywords/csdAssign');
const csdVisibility = require('../../../lib/keywords/csdVisibility');
const { createMongoDbIndex } = require('../../../lib/modules/mongoDbHelpers');

/* Todo
 * [ ] filter document fields based on query parameter fields
 * [ ] debug pagination
 */

format.extend(String.prototype);

module.exports = class DocsService extends CampsiService {
  async initialize() {
    const service = this;

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

    this.attachCollectionToResources();

    this.addClassToResources();

    await Promise.all([this.addSchemaValidationToResources(), this.createIndexes()]);

    return super.initialize();
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

  attachCollectionToResources() {
    for (const [resourceName, resource] of Object.entries(this.options.resources)) {
      resource.collection = this.db.collection(`docs.${this.path}.${resourceName}`);
    }
  }

  addClassToResources() {
    Object.entries(this.options.resources).forEach(([resourceName, resource]) => {
      this.options.resources[resourceName] = {
        ...resource,
        ...this.options.classes[resource.class]
      };
    });
  }

  async createIndexes() {
    const indexes = [];
    for (const resource of Object.values(this.options.resources)) {
      if (!resource.createDefaultIndexes) {
        continue;
      }
      const collection = resource.collection;
      indexes.push(
        ...[
          { collection, indexDefinition: { indexSpecs: { 'users.$**': 1 } } },
          { collection, indexDefinition: { indexSpecs: { groups: 1 } } }
        ]
      );
      const resourceStates = Object.keys(resource.states || {});
      const statesOptions = resourceStates.length > 1 ? { sparse: true } : {};
      indexes.push(
        ...[
          {
            collection,
            indexDefinition: {
              indexSpecs: { [`states.${resource.defaultState}.createdAt`]: 1 },
              options: statesOptions
            }
          }
        ]
      );
    }

    if (!indexes.length) {
      return;
    }

    for (const { collection, indexDefinition } of indexes) {
      await createMongoDbIndex(collection, indexDefinition, this.server.logger, this.server.environment);
    }
  }

  async addSchemaValidationToResources() {
    const ajvWriter = new Ajv({ allErrors: true, useAssign: true, strictTuples: false, strict: false });
    ajvErrors(ajvWriter);
    addFormats(ajvWriter);
    csdAssign(ajvWriter);
    const ajvReader = new Ajv({ allErrors: true, useVisibility: true, strictTuples: false, strict: false });
    ajvErrors(ajvReader);
    addFormats(ajvReader);
    csdVisibility(ajvReader);
    for (const resource of Object.values(this.options.resources)) {
      const schema = await $RefParser.dereference(this.config.optionsBasePath + '/', resource.schema, {});
      resource.schema = schema;
      resource.validate = ajvWriter.compile(schema);
      resource.filter = ajvWriter.compile(schema);
    }
  }
};
