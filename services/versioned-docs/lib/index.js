/* eslint-disable array-callback-return */
const CampsiService = require('../../../lib/service');
const param = require('./param');
const handlers = require('./handlers');
const Ajv = require('ajv');
const ajvErrors = require('ajv-errors');
const $RefParser = require('json-schema-ref-parser');
const debug = require('debug')('campsi:versioned-docs');
const csdAssign = require('../../../lib/keywords/csdAssign');
const csdVisibility = require('../../../lib/keywords/csdVisibility');

module.exports = class VersionedDocsService extends CampsiService {
  initialize() {
    const service = this;
    const server = this.server;

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

    const ajvWriter = new Ajv({ allErrors: true, useAssign: true, strict: false });
    ajvErrors(ajvWriter);
    csdAssign(ajvWriter);
    const ajvReader = new Ajv({ allErrors: true, useVisibility: true, strict: false });
    ajvErrors(ajvReader);
    csdVisibility(ajvReader);
    try {
      return Promise.all(
        Object.entries(service.options.resources).map(async ([resName, resource]) => {
          resource = {
            ...resource,
            ...service.options.classes[resource.class]
          };
          ['current', 'revision', 'version'].map(col => {
            resource[`${col}Collection`] = server.db.collection(`${service.options.dbPrefix}.${resName}-${col}`);
          });
          const relIndexes = Object.entries(resource.rels || {}).map(([, rel]) => {
            return { key: { [`${rel.path}`]: 1 } };
          });
          await resource.currentCollection.createIndexes([{ key: { 'users.$**': 1 } }, { key: { revision: 1 } }, ...relIndexes]);

          await resource.revisionCollection.createIndex({ currentId: 1, revision: 1 }, { unique: true });

          await resource.versionCollection.createIndex({ currentId: 1, version: 1 }, { unique: true });
          await resource.versionCollection.createIndex({ currentId: 1, revision: 1 }, { unique: true });
          await resource.versionCollection.createIndex({ currentId: 1, tag: 1 }, { unique: true });

          const schema = await $RefParser.dereference(service.config.optionsBasePath + '/', resource.schema, {});
          resource.schema = schema;
          resource.validate = ajvWriter.compile(schema);
          resource.filter = ajvReader.compile(schema);
          return (service.options.resources[`${resName}`] = resource);
        })
      );
    } catch (e) {
      debug(e);
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
