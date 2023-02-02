const CampsiServer = require('campsi');
const { emptyDatabase } = require('../helpers/emptyDatabase');
const debug = require('debug')('campsi:test');

module.exports = (config, services, context) => async done => {
  await emptyDatabase(config);

  context.campsi = new CampsiServer(config.campsi);
  context.campsi.mount('trace', new services.Trace(config.services.trace));
  context.campsi.mount('webhooks', new services.Webhooks(config.services.webHooks));
  context.campsi.on('campsi/ready', () => {
    context.server = context.campsi.listen(config.port);
    done();
  });
  context.campsi.start().catch(err => {
    debug('Error: %s', err);
  });
};
