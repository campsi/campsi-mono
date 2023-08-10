const CampsiServer = require('campsi');
const { emptyDatabase } = require('./emptyDatabase');
const debug = require('debug')('campsi:test');

module.exports =
  (config, services, context, cb = () => {}) =>
    done => {
      emptyDatabase(config).then(() => {
        context.campsi = new CampsiServer(config.campsi);
        Object.entries(services).map(([name, service]) => {
        // eslint-disable-next-line new-cap
          return context.campsi.mount(name.toLowerCase(), new service(config.services[name.toLowerCase()]));
        });

        context.campsi.on('campsi/ready', async () => {
          context.server = context.campsi.listen(config.port);
          await cb();
          done();
        });

        context.campsi.start();
      });
    };
