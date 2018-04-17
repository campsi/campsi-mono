process.env.NODE_CONFIG_DIR = './config';
process.env.NODE_ENV = 'test';

const CampsiServer = require('campsi');
const config = require('config');
const debug = require('debug')('campsi:test');

const services = {
  Auth: require('../lib/index')
};

let campsi = new CampsiServer(config.campsi);

campsi.mount('auth', new services.Auth(config.services.auth));

campsi.on('campsi/ready', () => {
  debug('ready');
  campsi.listen(config.port);
});

campsi.on('auth/local/passwordResetTokenCreated', user => {
  debug('passwordResetTokenCreated', user.identities.local.passwordResetToken);
});

process.on('uncaughtException', function () {
  debug('uncaughtException', arguments);
});

process.on('unhandledRejection', (reason, p) => {
  debug('Unhandled Rejection at:', p, 'reason:', reason);
  process.exit(1);
});

campsi.start()
  .catch((error) => {
    debug(error);
  });
