/* eslint-disable space-before-function-paren */
/* eslint-disable array-callback-return */
const debug = require('debug')('campsi:service:trace');

module.exports.traceRequest = function(req, res) {
  req.service.emit('request', {
    method: req.method,
    url: req.url,
    headers: req.headers
  });
  debug('========== Incoming Request ==========');
  debug(req.method + ' ' + req.url);
  Object.entries(req.headers).map(([name, value]) => {
    debug('> ' + name + ': ' + value);
  });
  if (req.is('application/json')) {
    const output = JSON.stringify(req.body, null, '  ');
    for (const line of output.split('\n')) {
      debug('| ' + line);
    }
  }
  if (req.is('multipart/form-data')) {
    debug(req.body);
  }
  res.json({ message: 'OK' });
};
