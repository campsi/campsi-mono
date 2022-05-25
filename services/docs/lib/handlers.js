const helpers = require('../../../lib/modules/responseHelpers');
const resourceService = require('./services/resource');
const documentService = require('./services/document');
const userService = require('./services/user');
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

module.exports.getDocuments = function(req, res) {
  const pagination = {};
  const perPage = req.query.perPage || req.resource.perPage;
  if (perPage) pagination.perPage = perPage;
  if (req.query.page) pagination.page = req.query.page;
  pagination.infinite = req.query.pagination && `${req.query.pagination}`.toLowerCase() === 'false';

  documentService
    .getDocuments(req.resource, req.filter, req.user, req.query, req.state, req.query.sort, pagination, req.options.resources)
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

module.exports.postDoc = function(req, res) {
  if (!!req.query?.parentId && !ObjectId.isValid(req.query.parentId)) {
    return helpers.badRequest(res, new Error('Invalid parent id'));
  }
  documentService
    .createDocument(req.resource, req.body, req.state, req.user, req?.query?.parentId, req.groups)
    .then(data => {
      helpers.json(res, data);
      return data;
    })
    .then(body => req.service.emit('document/created', getEmitPayload(req, { documentId: body.id, data: body.data })))
    .catch(error => {
      debug(error);
      return helpers.validationError(res)(error);
    });
};

// modify the state of a doc
module.exports.putDocState = function(req, res) {
  documentService
    .setDocumentState(req.resource, req.filter, req.body.from, req.body.to, req.user)
    .then(result => helpers.json(res, result))
    .then(() => req.service.emit('document/state/changed', getEmitPayload(req, { to: req.body.to, from: req.body.from })))
    .catch(err => {
      switch (err.message) {
        case 'Validation Error':
          return helpers.validationError(res);
        case 'Not Found':
          return helpers.notFound(res);
        default:
          return helpers.error(res, err);
      }
    });
};

// modify a doc
module.exports.putDoc = function(req, res) {
  documentService
    .setDocument(req.resource, req.filter, req.body, req.state, req.user)
    .then(result => helpers.json(res, result))
    .then(() => req.service.emit('document/updated', getEmitPayload(req, { data: req.body })))
    .catch(err => {
      switch (err.message) {
        case 'Validation Error': {
          return helpers.validationError(res)(err);
        }
        case 'Not Found':
          return helpers.notFound(res);
        default:
          return helpers.error(res, err);
      }
    });
};

module.exports.patchDoc = async (req, res) => {
  try {
    const result = await documentService.patchDocument(req.resource, req.filter, req.body, req.state, req.user);
    helpers.json(res, result);
    req.service.emit('document/patched', getEmitPayload(req, { data: req.body }));
  } catch (err) {
    switch (err.message) {
      case 'Validation Error': {
        return helpers.validationError(res)(err);
      }
      case 'Not Found':
        return helpers.notFound(res);
      default:
        return helpers.error(res, err);
    }
  }
};

// get a doc
module.exports.getDoc = function(req, res) {
  documentService
    .getDocument(req.resource, req.filter, req.query, req.user, req.state, req.options.resources)
    .then(result => helpers.json(res, result))
    .catch(err => helpers.notFound(res, err));
};

module.exports.delDoc = function(req, res) {
  documentService
    .deleteDocument(req.resource, req.filter)
    .then(result => {
      result.deletedCount === 0 ? helpers.notFound(res, result) : helpers.json(res, result);
    })
    .then(() => req.service.emit('document/deleted', getEmitPayload(req)))
    .catch(err => helpers.notFound(res, err));
};

module.exports.getResources = function(req, res) {
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

module.exports.getDocUsers = function(req, res) {
  documentService
    .getDocumentUsers(req.resource, req.filter)
    .then(users => userService.fetchUsers(users, req.options, req.service.server))
    .then(fetchedUsers => helpers.json(res, fetchedUsers))
    .catch(err => helpers.notFound(res, err));
};

module.exports.postDocUser = function(req, res) {
  documentService
    .addUserToDocument(req.resource, req.filter, req.body)
    .then(users => userService.fetchUsers(users, req.options, req.service.server))
    .then(result => helpers.json(res, result))
    .then(() => req.service.emit('document/users/added', getEmitPayload(req, { addedUserId: req.body.userId })))
    .catch(err => helpers.notFound(res, err));
};

module.exports.delDocUser = function(req, res) {
  documentService
    .removeUserFromDocument(req.resource, req.filter, req.params.user, req.db)
    .then(users => userService.fetchUsers(users, req.options, req.service.server))
    .then(result => helpers.json(res, result))
    .then(() => req.service.emit('document/users/removed', getEmitPayload(req, { removedUserId: req.params.user })))
    .catch(err => helpers.notFound(res, err));
};
