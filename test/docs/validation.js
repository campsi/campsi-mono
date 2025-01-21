/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/docs/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies

const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const createUser = require('../helpers/createUser');
const setupBeforeEach = require('../helpers/setupBeforeEach');
const config = require('config');
const { expect } = require('chai');
const { patchAJsonDoc } = require('../../services/docs/lib/modules/queryBuilder');

chai.should();
format.extend(String.prototype);
chai.use(chaiHttp);

const owner = {
  displayName: 'Document Owner',
  email: 'owner@agilitation.fr',
  username: 'owner',
  password: 'signup!'
};

const services = {
  Auth: require('../../services/auth/lib'),
  Docs: require('../../services/docs/lib')
};

describe('Validation', () => {
  const context = {};
  beforeEach(setupBeforeEach(config, services, context));

  afterEach(done => {
    context.server.close(done);
  });

  describe('Create a well-formed document', () => {
    it('it should return the created object', done => {
      const campsi = context.campsi;
      createUser(chai, campsi, owner).then(token => {
        chai
          .request(campsi.app)
          .post('/docs/pizzas')
          .set('Authorization', 'Bearer ' + token)
          .send({ name: 'renne' })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.an('object');
            res.body.should.have.a.property('data').that.is.an('object');
            res.body.data.should.have.a.property('name').that.is.a('string');
            res.body.data.name.should.eq('renne');
            done();
          });
      });
    });
  });

  describe('Create a malformed document', () => {
    it('it should return hints on the validation with a 400 error', done => {
      const campsi = context.campsi;
      createUser(chai, campsi, owner).then(token => {
        chai
          .request(campsi.app)
          .post('/docs/pizzas')
          .set('Authorization', 'Bearer ' + token)
          .send({ title: 'renne' })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(400);
            res.should.be.json;
            res.body.should.be.an('object');
            res.body.should.have.a.property('message').that.is.a('string');
            res.body.message.should.eq('Validation Error');
            res.body.should.have.a.property('errors').that.is.an('array');
            res.body.errors.should.have.a.lengthOf(2);
            done();
          });
      });
    });
  });
  describe('patchAJsonDoc', function () {
    it('should patch a single field in the JSON', function () {
      const originalJson = {
        name: 'Sample Name',
        details: {
          description: 'Old Description',
          info: {
            year: 2020,
            author: 'John Doe'
          }
        }
      };

      const patchData = {
        'details.description': 'Updated Description'
      };

      const result = patchAJsonDoc(originalJson, patchData);

      expect(result.details.description).to.equal('Updated Description');
      expect(result.details.info.year).to.equal(2020); // Ensure other fields remain unchanged
    });

    it('should patch multiple fields in the JSON', function () {
      const originalJson = {
        name: 'Sample Name',
        details: {
          description: 'Old Description',
          info: {
            year: 2020,
            author: 'John Doe'
          }
        }
      };

      const patchData = {
        'details.description': 'Updated Description',
        'details.info.year': 2023
      };

      const result = patchAJsonDoc(originalJson, patchData);

      expect(result.details.description).to.equal('Updated Description');
      expect(result.details.info.year).to.equal(2023);
      expect(result.details.info.author).to.equal('John Doe'); // Ensure other fields remain unchanged
    });

    it('should add a new field to the JSON', function () {
      const originalJson = {
        name: 'Sample Name',
        details: {
          description: 'Old Description',
          info: {
            year: 2020,
            author: 'John Doe'
          }
        }
      };

      const patchData = {
        'details.newField': 'New Value'
      };

      const result = patchAJsonDoc(originalJson, patchData);

      expect(result.details.newField).to.equal('New Value');
      expect(result.details.description).to.equal('Old Description'); // Ensure other fields remain unchanged
    });

    it('should update a field with an object', function () {
      const originalJson = {
        name: 'Sample Name',
        details: {
          description: 'Old Description',
          info: {
            year: 2020,
            author: 'John Doe'
          }
        }
      };

      const patchData = {
        'details.info': { year: 2025 }
      };

      const result = patchAJsonDoc(originalJson, patchData);

      expect(result.details.info.year).to.equal(2025);
      expect(result.details.info.author).to.equal(undefined);
      expect(result.details.description).to.equal('Old Description'); // Ensure other fields remain unchanged
    });

    it('should handle an empty patch data object', function () {
      const originalJson = {
        name: 'Sample Name',
        details: {
          description: 'Old Description',
          info: {
            year: 2020,
            author: 'John Doe'
          }
        }
      };

      const patchData = {}; // No changes

      const result = patchAJsonDoc(originalJson, patchData);

      expect(result).to.deep.equal(originalJson); // Should remain unchanged
    });

    it('should handle a deep patch in the JSON', function () {
      const originalJson = {
        name: 'Sample Name',
        details: {
          description: 'Old Description',
          info: {
            year: 2020,
            author: 'John Doe',
            meta: {
              published: false
            }
          }
        }
      };

      const patchData = {
        'details.info.meta.published': true
      };

      const result = patchAJsonDoc(originalJson, patchData);

      expect(result.details.info.meta.published).to.equal(true);
    });
    it('should delete value if null', function () {
      const originalJson = {
        name: 'Sample Name',
        details: {
          description: 'Old Description',
          info: {
            year: 2020,
            author: 'John Doe',
            meta: {
              published: false,
              unpublished: true
            }
          }
        }
      };

      const patchData = {
        'details.info.meta.published': null
      };

      const result = patchAJsonDoc(originalJson, patchData);

      expect(result.details.info.meta).to.not.have.property('published');
      expect(result.details.info.meta).to.not.be.empty;
    });
  });
});
