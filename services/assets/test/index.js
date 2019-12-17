process.env.NODE_CONFIG_DIR = './config';
process.env.NODE_ENV = 'test';

const CampsiServer = require('campsi');
const config = require('config');
const debug = require('debug')('campsi:test');

const services = {
  Assets: require('../lib/index')
};

let campsi = new CampsiServer(config.campsi);

campsi.mount('assets', new services.Assets(config.services.assets));

campsi.on('campsi/ready', () => {
  debug(`ready, listening on port ${config.port}`);
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
