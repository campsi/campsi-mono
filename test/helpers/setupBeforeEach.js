const CampsiServer = require('campsi');
const { emptyDatabase } = require('./emptyDatabase');
const debug = require('debug')('campsi:test');

module.exports = async (config, services, context) => {
  await emptyDatabase(config);
  context.campsi = new CampsiServer(config.campsi);
  Object.entries(services).map(([name, service]) => {
    // eslint-disable-next-line new-cap
    return context.campsi.mount(name.toLowerCase(), new service(config.services[name.toLowerCase()]));
  });

  context.campsi.on('campsi/ready', () => {
    context.server = context.campsi.listen(config.port);
  });
  return await context.campsi.start();
};
