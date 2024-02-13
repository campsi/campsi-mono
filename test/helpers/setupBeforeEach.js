const CampsiServer = require('campsi');
const find = require('find-process');
const { emptyDatabase } = require('./emptyDatabase');

module.exports =
  (config, services, context, cb = () => {}) =>
    done => {
      emptyDatabase(config).then(() => {
        find('port', config.port) // condition pour kill que campsi
          .then(list => {
            const processIds = list.map(item => item.pid);
            processIds.forEach(pid => process.kill(pid, 9));
          })
          .finally(() => {
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
      });
    };
