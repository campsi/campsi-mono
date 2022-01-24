const helpers = require('../../../lib/modules/responseHelpers');
const resourceService = require('./services/resource');
const documentService = require('./services/document');
const userService = require('./services/user');
const forIn = require('for-in');
const buildLink = require('../../../lib/modules/buildLink');
const debug = require('debug')('campsi:docs');
const { ObjectId } = require('mongodb');

const getEmitPayload = (req, additionalProps) => {
  return Object.assign(
    {
      documentId: req.params.id,
      userId: req.user ? req.user._id : null,
      state: req.state,
      resource: req.resource
    },
    additionalProps || {}
  );
};

module.exports.getDocuments = async (req, res) => {
  let pagination = {};
  let perPage = req.query.perPage || req.resource.perPage;
  if (perPage) pagination.perPage = perPage;
  if (req.query.page) pagination.page = req.query.page;

  try {
    const data = await documentService.getDocuments(
      req.resource,
      req.filter,
      req.user,
      req.query,
      req.query.sort,
      pagination,
      req.options.resources
    );

    const links = [];
    Object.entries(data.nav).map(([rel, page]) => {
      if (!!page && page !== data.page) {
        links.push(
          `<${buildLink(req, page, ['perPage', 'sort'])}>; rel="${rel}"`
        );
      }
    });

    const headers = {
      'X-Total-Count': data.count,
      'X-Page': data.page,
      'X-Per-Page': data.perPage,
      'X-Last-Page': data.nav.last,
      'Access-Control-Expose-Headers':
        'X-Total-Count, X-Page, X-Per-Page, X-Last-Page'
    };
    if (links.length) {
      headers.Link = links.join(', ');
    }
    return helpers.json(res, data.docs, headers);
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
};
Object.defineProperty(module.exports.getDocuments, 'apidoc', {
  value: {
    summary: 'Get documents'
  }
});

module.exports.postDoc = async (req, res) => {
  try {
    const doc = await documentService.createDocument(
      req.resource,
      req.body,
      req.user,
      req.groups
    );
    helpers.json(res, doc);
    req.service.emit('document/created', getEmitPayload(req, { doc }));
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
};

module.exports.updateDoc = async (req, res) => {
  try {
    const result = await documentService.updateDocument(
      req.resource,
      req.filter,
      req.body,
      req.user
    );
    helpers.json(res, result);
    req.service.emit(
      'document/updated',
      getEmitPayload(req, { data: req.body })
    );
  } catch (err) {
    if (err.message.includes('not found')) return helpers.notFound(res, err);
    if (err.message.includes('duplicate')) return helpers.conflict(res);
    return helpers.internalServerError(res, e);
  }
};

module.exports.getDoc = async (req, res) => {
  try {
    const doc = await documentService.getDocument(
      req.resource,
      req.filter,
      req.query
    );
    if (!doc) return helpers.notFound(res, new Error('Document not found'));
    return helpers.json(res, doc);
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
};

module.exports.getDocRevisions = async (req, res) => {
  try {
    const docRevisions = await documentService.getDocumentRevisions(
      req.resource,
      req.filter,
      req.query
    );
    return helpers.json(res, docRevisions);
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
};

module.exports.getDocRevision = async (req, res) => {
  const docRevision = '';
};

module.exports.delDoc = function(req, res) {
  documentService
    .deleteDocument(req.resource, req.filter)
    .then(result => helpers.json(res, result))
    .then(() => req.service.emit('document/deleted', getEmitPayload(req)))
    .catch(err => helpers.notFound(res, err));
};

module.exports.getResources = function(req, res) {
  return helpers.json(res, resourceService.getResources(req.options));
};
Object.defineProperty(module.exports.getResources, 'apidoc', {
  value: {
    summary: 'Get all resources',
    description: 'List all resources from schema.'
  }
});

module.exports.getDocUsers = async (req, res) => {
  try {
    const usersId = await documentService.getDocumentUsers(
      req.resource,
      req.filter
    );
    if (!usersId.length)
      return helpers.notFound(res, new Error('Document not found'));
    const users = await userService.fetchUsers(
      usersId,
      req.options,
      req.service.server
    );
    return helpers.json(res, users);
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
};

module.exports.postDocUser = async (req, res) => {
  try {
    const usersId = await documentService.addUserToDocument(
      req.resource,
      req.filter,
      req.body
    );
    if (!usersId?.length)
      return helpers.notFound(res, new Error('Document not found'));
    const users = await userService.fetchUsers(
      usersId,
      req.options,
      req.service.server
    );

    helpers.json(res, users);

    return req.service.emit(
      'document/users/added',
      getEmitPayload(req, { addedUserId: req.body.userId })
    );
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
};

module.exports.delDocUser = async (req, res) => {
  try {
    const usersId = await documentService.removeUserFromDocument(
      req.resource,
      req.filter,
      req.params.user,
      req.db
    );
    if (!usersId) return helpers.notFound(res, new Error('Document not found'));

    const users = await userService.fetchUsers(
      usersId,
      req.options,
      req.service.server
    );
    helpers.json(res, users);
    return req.service.emit(
      'document/users/removed',
      getEmitPayload(req, { removedUserId: req.params.user })
    );
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
};
