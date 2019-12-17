const debug = require('debug')('campsi:service:trace');
const forIn = require('for-in');

module.exports.traceRequest = function (req, res) {
  req.service.emit('request', {
    method: req.method,
    url: req.url,
    headers: req.headers
  });
  debug('========== Incoming Request ==========');
  debug(req.method + ' ' + req.url);
  forIn(req.headers, (value, name) => {
    debug('> ' + name + ': ' + value);
  });
  if (req.is('application/json')) {
    let output = JSON.stringify(req.body, null, '  ');
    for (let line of output.split('\n')) {
      debug('| ' + line);
    }
  }
  if (req.is('multipart/form-data')) {
    debug(req.body);
  }
  res.json({message: 'OK'});
};
