const helpers = require('../../../lib/modules/responseHelpers');
const resourceService = require('./services/resource');
const documentService = require('./services/document');
const userService = require('./services/user');
const buildLink = require('../../../lib/modules/buildLink');
const createError = require('http-errors');
const { getUsersCollection } = require('../../auth/lib/modules/collectionNames');
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

const getDocumentData = doc => {
  const { _id, createdAt, createdBy, updatedAt, updatedBy, users, groups, publishedAt, publishedBy, ...data } = doc;
  return data;
};

const getETagFromIfMatch = req => {
  const etag = req.headers['if-match'];
  if (!etag) {
    throw new Error('Missing If-Match header');
  }
  return etag;
};

module.exports.getDocuments = async (req, res, next) => {
  const pagination = {};
  const perPage = req.query.perPage || req.resource.perPage;
  if (perPage) pagination.perPage = perPage;
  if (req.query.page) pagination.page = req.query.page;
  pagination.infinite = req.query.pagination && `${req.query.pagination}`.toLowerCase() === 'false';

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
  Object.entries(data.nav).forEach(([rel, page]) => {
    if (!!page && page !== data.page) {
      links.push(`<${buildLink(req, page, ['perPage', 'sort'])}>; rel="${rel}"`);
    }
  });

  const headers = {};
  if (!pagination.infinite) {
    headers['X-Total-Count'] = data.count;
    headers['X-Page'] = data.page;
    headers['X-Per-Page'] = data.perPage;
    headers['X-Last-Page'] = data.nav.last;
    const headersKeys = ['X-Total-Count', 'X-Page', 'X-Per-Page', 'X-Last-Page'];
    if (links.length) {
      headers.Link = links.join(', ');
      headersKeys.push('Link');
    }
    headers['Access-Control-Expose-Headers'] = headersKeys.join(', ');
  }

  return helpers.json(res, data.docs, headers);
};

module.exports.postDoc = async (req, res, next) => {
  const doc = await documentService.createDocument(req.resource, req.body, req.user);
  res.set('ETag', doc.revision);
  helpers.json(res, doc);
  return req.service.emit('versionedDocument/created', getEmitPayload(req, { doc }));
};

module.exports.updateDoc = async (req, res, next) => {
  const originalDoc = await documentService.getDocument(req.resource, req.filter);
  const result = await documentService.updateDocument(req.resource, req.filter, req.body, req.user, getETagFromIfMatch(req));
  res.set('ETag', result.revision);
  helpers.json(res, result);

  return req.service.emit(
    'versionedDocument/updated',
    getEmitPayload(req, { data: req.body, originalDocData: getDocumentData(originalDoc), newDocData: getDocumentData(result) })
  );
};

module.exports.getDoc = async (req, res, next) => {
  const doc = await documentService.getDocument(req.resource, req.filter, req.query);
  if (!doc) return next(new createError.NotFound('Document not found'));
  res.set('ETag', doc.revision);
  return helpers.json(res, doc);
};

module.exports.getDocRevisions = async (req, res, next) => {
  const docRevisions = await documentService.getDocumentRevisions(req.resource, req.filter, req.query);
  return helpers.json(res, docRevisions);
};

module.exports.getDocRevision = async (req, res, next) => {
  const docRevision = await documentService.getDocumentRevision(req.resource, req.filter, req.query, req.params.revision);
  if (!docRevision) return next(new createError.NotFound('Document revision not found'));
  return helpers.json(res, docRevision);
};

module.exports.setDocVersion = async (req, res, next) => {
  const lastVersionDoc = await req.resource.versionCollection.findOne({ currentId: req.filter._id }, { sort: { version: -1 } });
  const version = await documentService.setDocumentVersion(
    req.resource,
    req.filter,
    req.query,
    req.params.revision,
    req.body,
    req.user
  );
  helpers.json(res, version);
  req.service.emit(
    'versionedDocument/version-created',
    getEmitPayload(req, {
      documentId: req.filter._id,
      version,
      originalDocData: getDocumentData(lastVersionDoc),
      newDocData: getDocumentData(version)
    })
  );
};

module.exports.getDocVersions = async (req, res, next) => {
  const docVersions = await documentService.getDocumentVersions(req.resource, req.filter, req.query);
  return helpers.json(res, docVersions);
};

module.exports.getDocVersion = async (req, res, next) => {
  const docVersion = await documentService.getDocumentVersion(req.resource, req.filter, req.query, req.params.version);
  if (!docVersion) return next(new createError.NotFound('Document not found'));
  return helpers.json(res, docVersion);
};

module.exports.delDoc = async (req, res, next) => {
  const originalDoc = await documentService.getDocument(req.resource, req.filter);
  const result = await documentService.deleteDocument(req.resource, req.filter, req.query);
  helpers.json(res, result);
  return req.service.emit('versionedDocument/deleted', getEmitPayload(req, { originalDocData: getDocumentData(originalDoc) }));
};

module.exports.getResources = function (req, res, next) {
  return helpers.json(res, resourceService.getResources(req.options));
};

module.exports.getDocUsers = async (req, res, next) => {
  const usersId = await documentService.getDocumentUsers(req.resource, req.filter);
  if (!usersId.length) return next(createError(404, 'Document not found'));
  const users = await userService.fetchUsers(usersId, req.options, req.service.server);
  return helpers.json(res, users);
};

module.exports.postDocUser = async (req, res, next) => {
  const usersId = await documentService.addUserToDocument(req.resource, req.filter, req.body);
  if (!usersId?.length) return next(createError(404, 'Document not found'));
  const users = await userService.fetchUsers(usersId, req.options, req.service.server);

  helpers.json(res, users);

  return req.service.emit('versionedDocument/users/added', getEmitPayload(req, { addedUserId: req.body.userId }));
};

module.exports.delDocUser = async (req, res, next) => {
  const usersCollection = await getUsersCollection(req.campsi, req.service.path);
  const usersId = await documentService.removeUserFromDocument(req.resource, req.filter, req.params.user, usersCollection);
  if (!usersId) return next(createError(404, 'Document not found'));

  const users = await userService.fetchUsers(usersId, req.options, req.service.server);
  helpers.json(res, users);
  return req.service.emit('versionedDocument/users/removed', getEmitPayload(req, { removedUserId: req.params.user }));
};
