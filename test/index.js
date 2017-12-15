process.env.NODE_CONFIG_DIR = './config';
process.env.NODE_ENV = 'index';

const CampsiServer = require('campsi');
const config = require('config');
const debug = require('debug')('campsi:test');

const services = {
    Docs: require('../lib/index'),
};

let campsi = new CampsiServer(config.campsi);

campsi.mount('docs', new services.Docs(config.services.docs));

campsi.on('campsi/ready', () => {
    debug('ready');
    campsi.listen(config.port);
});

process.on('uncaughtException', function () {
    debug('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    debug('unhandledRejection');
    debug(reason);
    process.exit(1);
});

campsi.start()
    .catch((error) => {
        debug(error);
    });
