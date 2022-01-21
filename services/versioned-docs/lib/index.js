const CampsiService = require('../../../lib/service');
const param = require('./param');
const handlers = require('./handlers');
const Ajv = require('ajv');
const $RefParser = require('json-schema-ref-parser');
const debug = require('debug')('campsi:docs');
const format = require('string-format');
const csdAssign = require('./keywords/csdAssign');
const csdVisibility = require('./keywords/csdVisibility');

format.extend(String.prototype);

module.exports = class VersionedDocsService extends CampsiService {
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
    this.router.get('/:resource/:id/users', handlers.getDocUsers);
    this.router.post('/:resource/:id/users', handlers.postDocUser);
    this.router.delete('/:resource/:id/users/:user', handlers.delDocUser);
    this.router.get('/:resource/:id', handlers.getDoc);
    /*



    this.router.post('/:resource/:state', handlers.postDoc);
    this.router.post('/:resource', handlers.postDoc);
    this.router.put('/:resource/:id/state', handlers.putDocState);
    this.router.put('/:resource/:id/:state', handlers.putDoc);
    this.router.put('/:resource/:id', handlers.putDoc);
    this.router.patch('/:resource/:id', handlers.patchDoc);
    this.router.delete('/:resource/:id', handlers.delDoc);
    this.router.delete('/:resource/:id/:state', handlers.delDoc);*/

    let ajvWriter = new Ajv({ useAssign: true });
    csdAssign(ajvWriter);
    let ajvReader = new Ajv({ useVisibility: true });
    csdVisibility(ajvReader);
    try {
      return Promise.all(
        Object.entries(service.options.resources).map(
          async ([resName, resource]) => {
            resource = {
              ...resource,
              ...service.options.classes[resource.class]
            };
            ['current', 'revision', 'version'].map(col => {
              resource[`${col}Collection`] = server.db.collection(
                `${service.options.dbPrefix}.${resName}-${col}`
              );
            });
            const relIndexes = Object.entries(resource.rels || {}).map(
              ([name, rel]) => {
                return { key: { [`${rel.path}`]: 1 } };
              }
            );
            await resource.currentCollection.createIndexes([
              { key: { 'users.$**': 1 } },
              { key: { revision: 1 } },
              { key: { createdBy: 1 } },
              ...relIndexes
            ]);

            await resource.revisionCollection.createIndex(
              { currentId: 1, revision: 1 },
              { unique: true }
            );
            await resource.revisionCollection.createIndexes([
              { key: { createdBy: 1 } },
              { key: { createdAt: 1 } }
            ]);

            await resource.versionCollection.createIndex(
              { revisionId: 1, version: 1 },
              { unique: true }
            );
            await resource.versionCollection.createIndexes([
              { key: { publishedBy: 1 } },
              { key: { publishedAt: 1 } }
            ]);

            const schema = await $RefParser.dereference(
              service.config.optionsBasePath + '/',
              resource.schema,
              {}
            );
            resource.schema = schema;
            resource.validate = ajvWriter.compile(schema);
            resource.filter = ajvReader.compile(schema);
            return (service.options.resources[`${resName}`] = resource);
          }
        )
      );
    } catch (e) {
      debug(e);
    }
  }

  describe() {
    let desc = super.describe();
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
