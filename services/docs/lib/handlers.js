const helpers = require('../../../lib/modules/responseHelpers');
const resourceService = require('./services/resource');
const documentService = require('./services/document');
const userService = require('./services/user');
const buildLink = require('../../../lib/modules/buildLink');
const buildSingleDocumentLink = require('../../../lib/modules/buildSingleDocumentLink');
const { ObjectId } = require('mongodb');
const ValidationError = require('../../../lib/errors/ValidationError');
const createError = require('http-errors');
const { getDocumentLockServiceOptions } = require('./modules/serviceOptions');
const { getUsersCollection } = require('../../auth/lib/modules/authCollections');

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

function dispatchError(res, error) {
  switch (true) {
    case error instanceof ValidationError:
      return helpers.validationError(res, error);
    case error.message.includes('Not Found'):
      return helpers.notFound(res, error);
    case error.message === 'Unauthorized':
      return helpers.unauthorized(res, error);
    default:
      return helpers.error(res, error);
  }
}

module.exports.deleteLock = async function (req, res) {
  try {
    await documentService.deleteLock(
      req?.params?.lock,
      req.user,
      getDocumentLockServiceOptions(req),
      req.db,
      req?.query?.surrogateId
    );
    return helpers.json(res);
  } catch (ex) {
    dispatchError(res, ex);
  }
};

module.exports.getDocuments = function (req, res) {
  const fullQuery = { ...req.query, ...req.body };

  const pagination = {};
  const perPage = fullQuery.perPage || req.resource.perPage;
  if (perPage) pagination.perPage = perPage;
  if (fullQuery.page) pagination.page = fullQuery.page;
  pagination.infinite = fullQuery.pagination && `${fullQuery.pagination}`.toLowerCase() === 'false';

  documentService
    .getDocuments(req.resource, req.filter, req.user, fullQuery, req.state, fullQuery.sort, pagination, req.options.resources)
    .then(data => {
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
    })
    .catch(() => {
      helpers.notFound(res);
    });
};

Object.defineProperty(module.exports.getDocuments, 'apidoc', {
  value: {
    summary: 'Get documents'
  }
});

module.exports.postDoc = async function (req, res, next) {
  if (!!req.query?.parentId && !ObjectId.isValid(req.query.parentId)) {
    return helpers.badRequest(res, new Error('Invalid parent id'));
  }

  try {
    await req.service.emit('document/creating', getEmitPayload(req, { body: req.body, user: req.user }));
    const doc = await documentService.createDocument(req.resource, req.body, req.state, req.user, req?.query?.parentId);
    helpers.json(res, doc);
    req.service.emit('document/created', getEmitPayload(req, { documentId: doc.id, data: doc.data }));
  } catch (err) {
    if (createError.isHttpError(err)) {
      return next(err);
    }
    return dispatchError(res, err);
  }
};

// modify the state of a doc
module.exports.putDocState = function (req, res) {
  documentService
    .setDocumentState(req.resource, req.filter, req.body.from, req.body.to, req.user)
    .then(result => helpers.json(res, result))
    .then(() => req.service.emit('document/state/changed', getEmitPayload(req, { to: req.body.to, from: req.body.from })))
    .catch(error => {
      return dispatchError(res, error);
    });
};

// modify a doc
module.exports.putDoc = async (req, res) => {
  try {
    let originalDoc = {};
    try {
      originalDoc = await documentService.getDocument(
        req.resource,
        req.filter,
        req.query,
        req.user,
        req.state,
        req.options.resources
      );
    } catch (error) {
      if (req.resource.defaultState !== req.state && !error.message.includes('Not Found')) {
        return dispatchError(res, error);
      }
    }
    const result = await documentService.setDocument(req.resource, req.filter, req.body, req.state, req.user, originalDoc);
    helpers.json(res, result);
    req.service.emit(
      'document/updated',
      getEmitPayload(req, { data: req.body, originalDocData: originalDoc.data, newDocData: result.data })
    );
  } catch (error) {
    return dispatchError(res, error);
  }
};

module.exports.patchDoc = async (req, res) => {
  try {
    const originalDoc = await documentService.getDocument(
      req.resource,
      req.filter,
      req.query,
      req.user,
      req.state,
      req.options.resources
    );

    const result = await documentService.patchDocument(req.resource, req.filter, req.body, req.state, req.user);
    helpers.json(res, result);
    req.service.emit(
      'document/patched',
      getEmitPayload(req, { data: req.body, originalDocData: originalDoc.data, newDocData: result.data })
    );
  } catch (error) {
    return dispatchError(res, error);
  }
};

// get a doc
module.exports.getDoc = function (req, res) {
  documentService
    .getDocument(req.resource, req.filter, req.query, req.user, req.state, req.options.resources, req.headers)
    .then(result =>
      documentService.getDocumentLinks(
        req.resource,
        req.filter,
        req.query,
        req.user,
        req.state,
        req.options.resources,
        req.headers,
        result
      )
    )
    .then(({ result, nav }) => {
      if (nav && (nav.next || nav.previous)) {
        const headers = {};
        const links = [];

        Object.entries(nav).forEach(([rel, id]) => {
          links.push(`<${buildSingleDocumentLink(req, id)}>; rel="${rel}"`);
        });

        const headersKeys = [];
        if (links.length) {
          headers.Link = links.join(', ');
          headersKeys.push('Link');
        }
        headers['Access-Control-Expose-Headers'] = headersKeys.join(', ');
        return helpers.json(res, result, headers);
      } else {
        return helpers.json(res, result);
      }
    })
    .catch(err => helpers.notFound(res, err));
};

module.exports.delDoc = async function (req, res) {
  try {
    const originalDoc = await documentService.getDocument(
      req.resource,
      req.filter,
      req.query,
      req.user,
      req.state,
      req.options.resources
    );
    const result = await documentService.deleteDocument(req.resource, req.filter);
    result.deletedCount === 0 ? helpers.notFound(res, result) : helpers.json(res, result);

    req.service.emit('document/deleted', getEmitPayload(req, { originalDocData: originalDoc.data }));
  } catch (err) {
    helpers.notFound(res, err);
  }
};

module.exports.getResources = function (req, res) {
  resourceService.getResources(req.options).then(result => {
    return helpers.json(res, result);
  });
};
Object.defineProperty(module.exports.getResources, 'apidoc', {
  value: {
    summary: 'Get all resources',
    description: 'List all resources from schema.'
  }
});

module.exports.getDocUsers = function (req, res) {
  documentService
    .getDocumentUsers(req.resource, req.filter)
    .then(users => userService.fetchUsers(users, req.options, req.service.server))
    .then(fetchedUsers => helpers.json(res, fetchedUsers))
    .catch(err => helpers.notFound(res, err));
};

module.exports.postDocUser = function (req, res) {
  documentService
    .addUserToDocument(req.resource, req.filter, req.body)
    .then(users => userService.fetchUsers(users, req.options, req.service.server))
    .then(result => helpers.json(res, result))
    .then(() => req.service.emit('document/users/added', getEmitPayload(req, { addedUserId: req.body.userId })))
    .catch(err => helpers.notFound(res, err));
};

module.exports.delDocUser = async function (req, res) {
  try {
    const usersCollection = await getUsersCollection(req.campsi, req.service.path);
    const users = await documentService.removeUserFromDocument(req.resource, req.filter, req.params.user, usersCollection);
    const result = await userService.fetchUsers(users, req.options, req.service.server);
    helpers.json(res, result);
    req.service.emit('document/users/removed', getEmitPayload(req, { removedUserId: req.params.user }));
  } catch (e) {
    helpers.notFound(res, e);
  }
};

module.exports.softDelete = function (req, res) {
  documentService
    .anonymizePersonalData(req.user, req.db, req.body?.collection, req.body?.field)
    .then(helpers.json(res))
    .catch(err => helpers.notFound(res, err));
};

module.exports.getLocks = async function (req, res) {
  try {
    const locks = await documentService.getLocks(req.state, req.filter, req.user, getDocumentLockServiceOptions(req), req.db);
    helpers.json(res, locks);
  } catch (ex) {
    dispatchError(res, ex);
  }
};

module.exports.lockDocument = function (req, res) {
  try {
    documentService.lockDocument(req.resource, req.state, req.filter, req.query?.lockTimeout, req.user, req).then(lock => {
      if (lock) {
        helpers.json(res, lock);
      } else {
        helpers.conflict(res);
      }
    });
  } catch (err) {
    helpers.badRequest(res, err);
  }
};
