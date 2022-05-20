const debug = require('debug')('campsi');

// Helpers
function buildBody(body, err) {
  if (err instanceof Error) {
    body.message = err.message;
    body.validationErrors = err.validationErrors;
    if (process.env.CAMPSI_DEBUG === '1') {
      body.stack = err.stack.split('\n');
    }
  } else if (typeof err !== 'undefined') {
    debug('Response Helpers received a bad error instance');
  }
}

function send(res, status, body) {
  return res.headersSent ? null : res.status(status).json(body);
}

// 4xx Errors
module.exports.badRequest = function(res, err) {
  const body = { message: 'bad request' };
  buildBody(body, err);
  send(res, 400, body);
};

module.exports.unauthorized = function(res, err) {
  const body = { message: 'unauthorized' };
  buildBody(body, err);
  send(res, 401, body);
};

module.exports.forbidden = function(res, err) {
  const body = { message: 'forbidden' };
  buildBody(body, err);
  send(res, 403, body);
};

module.exports.notFound = function(res, err) {
  const body = { message: 'not found' };
  buildBody(body, err);
  send(res, 404, body);
};

module.exports.conflict = function(res, err) {
  const body = {
    message: 'conflict'
  };
  buildBody(body, err);
  send(res, 409, body);
};

module.exports.preconditionFailed = function(res, err) {
  const body = {
    message: 'precondition failed'
  };
  buildBody(body, err);
  send(res, 412, body);
};

module.exports.missingParameters = function(res, err) {
  const body = { message: 'missing parameter(s)' };
  buildBody(body, err);
  send(res, 422, body);
};

// 5xx Errors
module.exports.internalServerError = function(res, err) {
  const body = { message: 'internal server error' };
  buildBody(body, err);
  send(res, 500, body);
};

module.exports.notImplemented = function(res, err) {
  const body = { message: 'not implemented' };
  buildBody(body, err);
  send(res, 501, body);
};

module.exports.serviceNotAvailable = (res, err) => {
  const body = { message: 'service unavailable' };
  buildBody(body, err);
  send(res, 503, body);
};

// Advanced Error handlers
module.exports.error = function(res, err) {
  let result = false;
  if (err) {
    module.exports.badRequest(res, err);
    result = true;
  }
  return result;
};

module.exports.validationError = function validationError(res) {
  return function(errors) {
    const err = new Error('validation error');
    err.validationErrors = errors;
    return module.exports.error(res, err);
  };
};

// Json Helper
module.exports.json = function json(res, body, headers) {
  if (headers) {
    // eslint-disable-next-line array-callback-return
    Object.entries(headers).map(([key, value]) => {
      res.header(key, value);
    });
  }
  return res.json(body);
};
