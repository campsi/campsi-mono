process.env.NODE_CONFIG_DIR = '../docs/config';
process.env.NODE_ENV = 'test';

const CampsiServer = require('campsi');
const config = require('config');
const debug = require('debug')('campsi:test');

const services = {
  Docs: require('../../services/docs/lib')
};

const campsi = new CampsiServer(config.campsi);

campsi.mount('docs', new services.Docs(config.services.docs));
campsi.app.use((req, res, next) => {
  if (req.query && req.query.userId) {
    req.user = { _id: req.query.userId };
  }
  next();
});

campsi.on('campsi/ready', () => {
  debug('ready');
  campsi.listen(process.env.PORT || config.port);
});

campsi.start().catch(error => {
  debug(error);
});
