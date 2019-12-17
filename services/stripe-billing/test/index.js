process.env.NODE_CONFIG_DIR = './config';
process.env.NODE_ENV = 'test';

const CampsiServer = require('campsi');
const config = require('config');
const debug = require('debug')('campsi:test');

const services = {
  StripeBilling: require('../lib/index')
};

let campsi = new CampsiServer(config.campsi);

campsi.mount('billing', new services.StripeBilling(config.services.billing));
campsi.app.use((req, res, next) => {
  if (req.query && req.query.userId) {
    req.user = {_id: req.query.userId};
  }
  next();
});

campsi.on('campsi/ready', () => {
  debug('ready');
  campsi.listen(process.env.PORT || config.port);
});

campsi.start()
  .catch((error) => {
    debug(error);
  });
