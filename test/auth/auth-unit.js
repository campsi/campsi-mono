const chai = require('chai');
const { atob, btoa } = require('../../services/auth/lib/modules/base64');

let assert = chai.assert;

describe('Unit Test', () => {
  describe('Module base 64', () => {
    it('should return a base64 encoded string', done => {
      assert.equal('Y2FtcHNp', btoa('campsi'));
      done();
    });
    it('should return a valid decoded string', done => {
      assert.equal('campsi', atob('Y2FtcHNp'));
      done();
    });
  });
});
