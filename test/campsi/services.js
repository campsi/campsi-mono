/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('../../index');
const CampsiService = require('../../lib/service');
const config = require('config');

chai.use(chaiHttp);
format.extend(String.prototype);
chai.should();
const assert = chai.assert;

class TestService extends CampsiService {}
class TestClass {}

describe('Services Test', function() {
  describe('mount  one module', function() {
    it('it should work', function(done) {
      const campsi = new CampsiServer(config.campsi);
      let passed = true;
      try {
        campsi.mount('test', new TestService(config.services.test));
      } catch (err) {
        passed = false;
      } finally {
        assert(passed, 'it must not fail');
        done();
      }
    });
  });

  describe('mount on an invalid path', function() {
    it('it should not work if path is invalid', function(done) {
      const campsi = new CampsiServer(config.campsi);
      let passed = false;
      try {
        campsi.mount('t3st', new TestService(config.services.test));
      } catch (err) {
        passed = err.message === 'Path is malformed';
      } finally {
        assert(passed, 'it must fail because of a malformed path');
        done();
      }
    });
  });

  describe('mount an invalid service', function() {
    it('it should not work if service is invalid', function(done) {
      const campsi = new CampsiServer(config.campsi);
      let passed = false;
      try {
        campsi.mount('test', new TestClass(config.services.test));
      } catch (err) {
        passed = err.message === 'Service is not a CampsiService';
      } finally {
        assert(passed, 'it must fail because of an invalid service');
        done();
      }
    });
  });

  describe('mount two modules', function() {
    it('it should work if path is different', function(done) {
      const campsi = new CampsiServer(config.campsi);
      let passed = true;
      try {
        campsi.mount('test', new TestService(config.services.test));
        campsi.mount('other', new TestService(config.services.test));
      } catch (err) {
        passed = false;
      } finally {
        assert(passed, 'it must not failed');
        done();
      }
    });

    it('it should not work if path are equals', function(done) {
      const campsi = new CampsiServer(config.campsi);
      let passed = false;
      try {
        campsi.mount('test', new TestService(config.services.test));
        campsi.mount('test', new TestService(config.services.test));
      } catch (err) {
        passed = err.message === 'Path already exists';
      } finally {
        assert(passed, 'it must fail because of a malformed path');
        done();
      }
    });
  });
});
