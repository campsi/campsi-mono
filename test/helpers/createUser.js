const debug = require('debug')('campsi:test');

module.exports = function createUser (chai, campsi, user) {
  return new Promise(resolve => {
    chai.request(campsi.app)
      .post('/auth/local/signup')
      .set('content-type', 'application/json')
      .send(user)
      .end((err, res) => {
        if (err) debug(`received an error from chai: ${err.message}`);
        resolve(res.body.token);
      });
  });
};
