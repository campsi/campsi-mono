const CampsiService = require('campsi/lib/service');
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

format.extend(String.prototype);

module.exports = class DocsService extends CampsiService {
  initialize () {
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
    this.router.get('/:resource/:id/:state', handlers.getDoc);
    this.router.get('/:resource/:id', handlers.getDoc);
    this.router.post('/:resource/:state', handlers.postDoc);
    this.router.post('/:resource', handlers.postDoc);
    this.router.put('/:resource/:id/state', handlers.putDocState);
    this.router.put('/:resource/:id/:state', handlers.putDoc);
    this.router.put('/:resource/:id', handlers.putDoc);
    this.router.delete('/:resource/:id', handlers.delDoc);
    this.router.delete('/:resource/:id/:state', handlers.delDoc);
    return new Promise((resolve) => {
      let ajvWriter = new Ajv({useAssign: true});
      csdAssign(ajvWriter);
      let ajvReader = new Ajv({useVisibility: true});
      csdVisibility(ajvReader);
      async.eachOf(service.options.resources, function (resource, name, cb) {
        Object.assign(resource, service.options.classes[resource.class]);
        resource.collection = server.db.collection('docs.{0}.{1}'.format(service.path, name));
        $RefParser.dereference(service.config.optionsBasePath + '/', resource.schema, {})
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
      }, resolve);
    });
  }

  describe () {
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
