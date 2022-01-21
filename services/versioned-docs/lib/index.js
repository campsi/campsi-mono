const CampsiService = require('../../../lib/service');
const param = require('./param');
const handlers = require('./handlers');
const async = require('async');
const forIn = require('for-in');
const Ajv = require('ajv');
const $RefParser = require('json-schema-ref-parser');
const debug = require('debug')('campsi:docs');
const format = require('string-format');
const csdAssign = require('./keywords/csdAssign');
const csdVisibility = require('./keywords/csdVisibility');
const ash = require('express-async-handler');

/* Todo
 * [ ] filter document fields based on query parameter fields
 * [ ] debug pagination
 */

format.extend(String.prototype);

module.exports = class VersionedDocsService extends CampsiService {
  async initialize() {
    const service = this;
    const server = this.server;

    this.router.use('/', (req, res, next) => {
      req.options = service.options;
      req.service = service;
      next();
    });
    this.router.param('resource', param.attachResource(service.options));
    this.router.get('/', handlers.getResources);
    /*    this.router.get('/:resource', handlers.getDocuments);
    this.router.get('/:resource/:id/users', handlers.getDocUsers);
    this.router.post('/:resource/:id/users', handlers.postDocUser);
    this.router.delete('/:resource/:id/users/:user', handlers.delDocUser);
    this.router.get('/:resource/:id/:state', handlers.getDoc);
    this.router.get('/:resource/:id', handlers.getDoc);
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
      await Promise.all(
        Object.entries(service.options.resources).map(
          async ([name, resource]) => {
            resource = {
              ...resource,
              ...service.options.classes[resource.class]
            };
            ['current', 'revision', 'version'].map(col => {
              resource[`${col}Collection`] = server.db.collection(
                `${service.path}.${name}-${col}`
              );
            });
            await resource.currentCollection.createIndexes([
              { users: { 'users.$**': 1 } },
              { projectId: { projectId: 1 } },
              { revision: { revision: 1 } },
              { createdBy: { createdBy: 1 } }
            ]);
            await resource.revisionCollection.createIndexes([
              [
                { revision: { revision: 1 } },
                { createdBy: { createdBy: 1 } },
                { createdAt: { createdAt: 1 } },
                { currentId: { currentId: 1 } }
              ]
            ]);
            await resource.versionCollection.createIndexes([
              [
                { revisionId: { revisionId: 1 } },
                { publishedBy: { publishedBy: 1 } },
                { publishedAt: { publishedAt: 1 } },
                { revisionId: { revisionId: 1 } }
              ]
            ]);

            const schema = await $RefParser.dereference(
              service.config.optionsBasePath + '/',
              resource.schema,
              {}
            );
            resource.schema = schema;
            resource.validate = ajvWriter.compile(schema);
            resource.filter = ajvFilter.compile(schema);
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
    forIn(this.options.resources, (resource, path) => {
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
