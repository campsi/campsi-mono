/* eslint-disable array-callback-return */
const CampsiService = require('../../../lib/service');
const param = require('./param');
const handlers = require('./handlers');
const Ajv = require('ajv');
const ajvErrors = require('ajv-errors');
const $RefParser = require('json-schema-ref-parser');
const csdAssign = require('../../../lib/keywords/csdAssign');
const csdVisibility = require('../../../lib/keywords/csdVisibility');
const { createMongoDbIndex } = require('../../../lib/modules/mongoDbHelpers');

module.exports = class VersionedDocsService extends CampsiService {
  initialize() {
    const service = this;

    const validateWriteAccess = (req, res, next) => {
      if (typeof this.options.validateWriteAccess === 'function') {
        return this.options.validateWriteAccess(req, res, next);
      }
      return next();
    };

    this.router.use('/', (req, res, next) => {
      req.options = service.options;
      req.service = service;
      next();
    });
    this.router.param('resource', param.attachResource(service.options));
    this.router.get('/', handlers.getResources);
    this.router.get('/:resource', handlers.getDocuments);
    this.router.get('/:resource/:id/users', handlers.getDocUsers);
    this.router.post('/:resource/:id/users', handlers.postDocUser);
    this.router.delete('/:resource/:id/users/:user', handlers.delDocUser);
    this.router.get('/:resource/:id/revisions/', handlers.getDocRevisions);
    this.router.get('/:resource/:id/revisions/:revision', handlers.getDocRevision);
    this.router.post('/:resource/:id/revisions/:revision[:]set-as-version', handlers.setDocVersion);
    this.router.get('/:resource/:id/versions/', handlers.getDocVersions);
    this.router.get('/:resource/:id/versions/:version', handlers.getDocVersion);
    this.router.get('/:resource/:id', handlers.getDoc);
    this.router.post('/:resource', validateWriteAccess, handlers.postDoc);
    this.router.patch('/:resource/:id', validateWriteAccess, handlers.updateDoc);
    this.router.delete('/:resource/:id', handlers.delDoc);

    this.attachCollectionToResources();

    this.addClassToResources();

    return Promise.all([this.createIndexes(), this.addSchemaValidationToResources(), super.initialize()]);
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
    Object.entries(this.options.resources).forEach(([resourceName, resource]) => {
      ['current', 'revision', 'version'].forEach(col => {
        resource[`${col}Collection`] = this.server.db.collection(`${this.options.dbPrefix}.${resourceName}-${col}`);
      });
    });
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
    Object.entries(this.options.resources).forEach(([resName, resource]) => {
      Object.values(resource.rels || {}).forEach(relation => {
        indexes.push({ collection: resource.currentCollection, indexDefinition: { indexSpecs: { [`${relation.path}`]: 1 } } });
      });

      indexes.push(
        ...[
          { collection: resource.currentCollection, indexDefinition: { indexSpecs: { 'users.$**': 1 } } },
          { collection: resource.currentCollection, indexDefinition: { indexSpecs: { revision: 1 } } },
          {
            collection: resource.revisionCollection,
            indexDefinition: { indexSpecs: { currentId: 1, revision: 1 }, options: { unique: true } }
          },
          {
            collection: resource.versionCollection,
            indexDefinition: { indexSpecs: { currentId: 1, version: 1 }, options: { unique: true } }
          },
          {
            collection: resource.versionCollection,
            indexDefinition: { indexSpecs: { currentId: 1, revision: 1 }, options: { unique: true } }
          },
          {
            collection: resource.versionCollection,
            indexDefinition: { indexSpecs: { currentId: 1, tag: 1 }, options: { unique: true } }
          }
        ]
      );
    });
    if (!indexes.length) {
      return;
    }

    return Promise.all(
      indexes.map(({ collection, indexDefinition }) =>
        createMongoDbIndex(collection, indexDefinition, this.server.logger, this.server.environment)
      )
    );
  }

  async addSchemaValidationToResources() {
    const ajvWriter = new Ajv({ allErrors: true, useAssign: true, strict: false });
    ajvErrors(ajvWriter);
    csdAssign(ajvWriter);
    const ajvReader = new Ajv({ allErrors: true, useVisibility: true, strict: false });
    ajvErrors(ajvReader);
    csdVisibility(ajvReader);

    for (const resource of Object.values(this.options.resources)) {
      const schema = await $RefParser.dereference(this.config.optionsBasePath + '/', resource.schema, {});
      resource.schema = schema;
      resource.validate = ajvWriter.compile(schema);
      resource.filter = ajvReader.compile(schema);
    }
  }
};
