const helpers = require('../../../lib/modules/responseHelpers');
const resourceService = require('./services/resource');
const documentService = require('./services/document');
const userService = require('./services/user');
const buildLink = require('../../../lib/modules/buildLink');

const getEmitPayload = (req, additionalProps) => {
  return Object.assign(
    {
      documentId: req.params.id,
      userId: req.user ? req.user._id : null,
      resource: req.resource
    },
    additionalProps || {}
  );
};

const getETagFromIfMatch = req => {
  const etag = req.headers['if-match'];
  if (!etag) {
    throw new Error('Missing If-Match header');
  }
  return etag;
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
    res.set('ETag', `revision-${doc.revision}`);
    helpers.json(res, doc);
    return req.service.emit('document/created', getEmitPayload(req, { doc }));
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
      req.user,
      getETagFromIfMatch(req)
    );
    helpers.json(res, result);
    return req.service.emit(
      'document/updated',
      getEmitPayload(req, { data: req.body })
    );
  } catch (e) {
    if (e.message.includes('not found')) return helpers.notFound(res, e);
    if (e.message.includes('duplicate')) return helpers.conflict(res, e);
    if (e.message.includes('Precondition Failed'))
      return helpers.preconditionFailed(res, e);
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
    res.set('ETag', `revision-${doc.revision}`);
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
  try {
    const docRevision = await documentService.getDocumentRevision(
      req.resource,
      req.filter,
      req.query,
      req.params.revision
    );
    if (!docRevision)
      return helpers.notFound(res, new Error('Document not found'));
    return helpers.json(res, docRevision);
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
};

module.exports.setDocVersion = async (req, res) => {
  try {
    const docRevision = await documentService.getDocumentRevision(
      req.resource,
      req.filter,
      req.query,
      req.params.revision
    );
    if (!docRevision)
      return helpers.notFound(res, new Error('Document not found'));

    const version = await documentService.setDocumentVersion(
      req.resource,
      req.filter,
      req.body,
      req.user,
      docRevision
    );
    return helpers.json(res, version);
  } catch (e) {
    if (e.message.includes('duplicate')) return helpers.conflict(res, e);
    return helpers.internalServerError(res, e);
  }
};

module.exports.getDocVersions = async (req, res) => {
  try {
    const docVersions = await documentService.getDocumentVersions(
      req.resource,
      req.filter,
      req.query
    );
    return helpers.json(res, docVersions);
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
};

module.exports.getDocVersion = async (req, res) => {
  try {
    const docVersion = await documentService.getDocumentVersion(
      req.resource,
      req.filter,
      req.query,
      req.params.version
    );
    if (!docVersion)
      return helpers.notFound(res, new Error('Document not found'));
    return helpers.json(res, docVersion);
  } catch (e) {
    return helpers.internalServerError(res, e);
  }
};

module.exports.delDoc = async (req, res) => {
  try {
    const result = await documentService.deleteDocument(
      req.resource,
      req.filter
    );
    helpers.json(res, result);
    return req.service.emit('document/deleted', getEmitPayload(req));
  } catch (e) {
    if (e.message.includes('not found')) return helpers.notFound(res, e);
    return helpers.internalServerError(res, e);
  }
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
