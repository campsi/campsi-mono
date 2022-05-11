const { ObjectId } = require('mongodb');
const bodyParser = require('body-parser');

process.env.NODE_CONFIG_DIR = './config';
process.env.NODE_ENV = 'test';

const CampsiServer = require('campsi');
const config = require('config');
const debug = require('debug')('campsi:test:webhooks');

const services = {
  Trace: require('campsi-service-trace'),
  Webhooks: require('../../services/webhooks/lib/index')
};

let campsi = new CampsiServer(config.campsi);

campsi.mount('trace', new services.Trace(config.services.trace));
campsi.mount('webhooks', new services.Webhooks(config.services.webhooks));
campsi.app.use((req, res, next) => {
  req.user = {
    displayName: 'Test user',
    email: 'test@user.com',
    _id: ObjectId()
  };
  next();
});
campsi.app.use(bodyParser.json());
campsi.app.post('/ping', (req, res) => {
  campsi.emit('webhooks/ping', req.body);
  res.json({
    success: true
  });
});
campsi.on('campsi/ready', () => {
  debug(`ready, start listining on port ${config.port}`);
  campsi.listen(config.port);
});

process.on('uncaughtException', function() {
  debug('uncaughtException');
});

process.on('unhandledRejection', reason => {
  debug('unhandledRejection');
  debug(reason);
  process.exit(1);
});

campsi.start().catch(error => {
  debug(error);
});
