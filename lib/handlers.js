/**
 * Created by romain on 06/12/2016.
 */

const helpers = require('campsi/lib/modules/responseHelpers');
const resourceService = require('./services/resource');
const documentService = require('./services/document');

module.exports.getDocuments = function (req, res) {
    let pagination = {};
    pagination.perPage = req.query.perPage || req.resource.perPage;
    pagination.page = req.query.page;

    documentService.getDocuments(req.resource, req.schema, req.user,req.query, req.state, req.sort, pagination)
        .then((result) => {
            helpers.json(res, result);
        })
        .catch(() => {
            helpers.notFound(res);
        });
};
Object.defineProperty(module.exports.getDocuments, 'apidoc', {value: {
    summary: 'Get documents'
}});

module.exports.postDoc = function (req, res) {
    documentService.createDocument(req.resource, req.body, req.state, req.user)
        .then((data) => {
            helpers.json(res, data);
        })
        .catch(helpers.validationError(res));
};

// get all states of a document
module.exports.getDocState = function (req, res) {
    documentService.getDocumentState(req.resource, req.filter, req.state, req.user)
        .then((data) => {
            helpers.json(res, data);
        })
        .catch(() => {
            helpers.notFound(res);
        });
};

// modify the state of a doc
module.exports.putDocState = function (req, res) {

    documentService.setDocumentState(req.resource, req.filter, req.body.from, req.body.to, req.user)
        .then((result) => {
            return helpers.json(res, result);
        }).catch((kind, error) => {
        switch(kind) {
            case 'validation':
                return helpers.validationError(res);
            case 'notFound':
                return helpers.notFound(res);
            default:
                return helpers.error(res, error);
        }
    });
};

// modify a doc
module.exports.putDoc = function (req, res) {
    documentService.setDocument(req.resource, req.filter, req.body, req.state, req.user)
        .then((result) => {
            return helpers.json(res, result);
        }).catch((kind, error) => {
            switch(kind) {
                case 'validation': {
                    let func = helpers.validationError(res);
                    return func(error);
                }
                case 'notFound':
                    return helpers.notFound(res);
                default:
                    return helpers.error(res, error);
            }
        });
};

// get a doc
module.exports.getDoc = function (req, res) {
    documentService.getDocument(req.resource, req.schema, req.filter, req.query, req.user, req.state, req.query.states)
        .then((result) => {
            return helpers.json(res, result);
        })
        .catch(() => {
            return helpers.notFound(res);
        });
};

module.exports.delDoc = function (req, res) {
    documentService.deleteDocument(req.resource, req.filter, req.state)
        .then(() => {
            return helpers.json(res, {'message': 'OK'});
        })
        .catch((error) => {
            if(error) {
                return helpers.error(res, error);
            } else {
                return helpers.notFound(res);
            }
        });
};

module.exports.getResources = function (req, res) {
    resourceService.getResources(req.options)
        .then((result) => {
            return helpers.json(res, result);
        });
};
Object.defineProperty(module.exports.getResources, 'apidoc', {value: {
    summary: 'Get all resources',
    description: 'List all resources from schema.'
}});
