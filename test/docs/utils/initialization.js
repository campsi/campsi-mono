const CampsiServer = require('campsi');
const format = require('string-format');
const chai = require('chai');
const chaiHttp = require('chai-http');
const { emptyDatabase } = require('../../helpers/emptyDatabase');
format.extend(String.prototype);
chai.use(chaiHttp);
chai.should();

module.exports = function initialize(config, services) {
  const campsi = new CampsiServer(config.campsi);
  Object.keys(services).forEach(service => {
    campsi.mount(service, new services[service](config.services[service]));
  });
  campsi.on('campsi/ready', () => {
    campsi.server = campsi.listen(config.port);
  });
  campsi.start();
  return {
    campsi,
    beforeEachCallback: async done => {
      await emptyDatabase(config);
      done();
    },
    afterCallback: done => {
      campsi.server.close();
      done();
    }
  };
};
