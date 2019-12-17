process.env.NODE_CONFIG_DIR = './config';
process.env.NODE_ENV = 'test';

const CampsiServer = require('campsi');
const config = require('config');
const debug = require('debug')('campsi:test');

const services = {
  Trace: require('../lib/index')
};

let campsi = new CampsiServer(config.campsi);

campsi.mount('trace', new services.Trace(config.services.trace));

campsi.on('campsi/ready', () => {
  debug('ready');
  campsi.listen(config.port);
});

process.on('uncaughtException', function () {
  debug('uncaughtException');
});

process.on('unhandledRejection', (reason, p) => {
  debug('Unhandled Rejection at:', p, 'reason:', reason);
  process.exit(1);
});

campsi.start()
  .catch((error) => {
    debug(error);
  });
