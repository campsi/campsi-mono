/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const debug = require('debug')('campsi:test');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const chaiHttp = require('chai-http');
const config = require('config');
const fs = require('fs');
const path = require('path');
const uniqueSlug = require('unique-slug');
const mime = require('mime-types');
const async = require('async');
const setupBeforeEach = require('../helpers/setupBeforeEach');

chai.use(chaiHttp);
chai.should();

const services = {
  Auth: require('../../services/auth/lib'),
  Trace: require('campsi-service-trace'),
  Assets: require('../../services/assets/lib')
};

describe('Assets API', () => {
  const context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => {
    context.server.close(done);
  });

  function createAsset(source) {
    return new Promise(function(resolve, reject) {
      const localStorage = context.campsi.services.get('assets').config.options.storages.local;
      const originalName = path.basename(source);
      const storageName = uniqueSlug('');
      const stats = fs.statSync(source);

      const file = {
        fieldName: 'file',
        originalName,
        clientReportedMimeType: mime.lookup(source),
        clientReportedFileExtension: path.extname(source),
        path: '',
        size: stats.size,
        detectedMimeType: mime.lookup(source),
        detectedFileExtension: path.extname(source),
        createdAt: new Date().getTime(),
        createdFrom: {
          origin: null,
          referer: null,
          ua: 'local'
        },
        storage: 'local',
        destination: {
          rel: '',
          abs: ''
        },
        url: ''
      };

      localStorage.destination().then(destination => {
        file.destination = destination;
        file.path = path.join(file.destination.abs, storageName);
        file.url = '/local/' + file.destination.rel + '/' + storageName;

        fs.writeFileSync(file.path, fs.readFileSync(source));

        context.campsi.services
          .get('assets')
          .collection.insertOne(file)
          .then(result => {
            resolve({
              id: result.insertedId.toString(),
              path: '/local/' + file.destination.rel + '/' + storageName
            });
          })
          .catch(err => reject(err));
      });
    });
  }

  function createAssets(files) {
    return new Promise(resolve => {
      async.each(
        files,
        (file, cb) => {
          createAsset(file)
            .then(result => {
              cb();
            })
            .catch(err => {
              if (err) {
                throw new Error("Can't create asset");
              }
              cb();
            });
        },
        () => {
          resolve();
        }
      );
    });
  }

  /*
   * Test the /GET / route
   */
  describe('/GET/', () => {
    it('it should return a list of assets', done => {
      createAssets(Array(5).fill('./test/rsrc/logo_agilitation.png')).then(() => {
        chai
          .request(context.campsi.app)
          .get('/assets/')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);

            res.should.have.status(200);
            res.should.have.header('x-total-count', '5');
            res.should.have.header('link');
            res.should.be.json;
            res.body.should.be.an('array');
            res.body.length.should.be.eq(5);
            done();
          });
      });
    });
  });
  /*
   * Test the /POST /copy route
   * We're able to create a new asset from a remote file URL
   */
  describe('/POST /copy', () => {
    it('it should copy a file from remote URL', done => {
      chai
        .request(context.campsi.app)
        .post('/assets/copy')
        .send({
          url: 'https://uploads-ssl.webflow.com/5d5f94b1c701ded9b6298526/5d5f994938c00e4777ad545a_Logo-axeptio-galet_500.png'
        })
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          done();
        });
    });
  });

  /*
   * Test the /POST /copy route
   * We're able to create a new asset from a remote file URL
   */
  describe('/POST /copy', () => {
    it('it should fail if remote URL does not exist', done => {
      chai
        .request(context.campsi.app)
        .post('/assets/copy')
        .send({
          url: 'https://axeptio.com/nofilehere.png'
        })
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(400);
          res.should.be.json;
          done();
        });
    });
  });

  /*
   * Test the /POST / route
   */
  describe('/POST /', () => {
    it('it should return ids of uploaded files', done => {
      chai
        .request(context.campsi.app)
        .post('/assets')
        .attach('file', fs.readFileSync('./test/rsrc/logo_agilitation.png'), 'logo_agilitation.png')
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          done();
        });
    });
  });
  /*
   * Test the /GET /local route
   */
  describe('/GET /assets/<asset>', () => {
    it('it should return local asset', done => {
      createAsset('./test/rsrc/logo_agilitation.png').then(asset => {
        chai
          .request(context.campsi.app)
          .get('/assets/{0}'.format(asset.id))
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.have.header('content-type', 'image/png');
            res.should.have.header('content-length', 78695);
            res.body.length.should.be.eq(78695);
            done();
          });
      });
    });
  });

  describe('/GET /assets/<asset>', () => {
    it('it should fail if local asset does not exist', done => {
      createAsset('./test/rsrc/logo_agilitation.dne')
        .then(() => {
          assert.fail('actual', 'expected', 'should not be here');
        })
        .catch(err => {
          err.should.not.be.null;
          done();
        });
    });
  });

  /*
   * Test the /GET /:asset/metadata route
   */
  describe('/GET /:asset/metadata', () => {
    it('it should return the asset metadata', done => {
      const timeBeforeAssetCreation = new Date();

      createAsset('./test/rsrc/logo_agilitation.png').then(asset => {
        chai
          .request(context.campsi.app)
          .get('/assets/{0}/metadata'.format(asset.id))
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;

            // test metadata
            res.body.should.have.property('_id');
            res.body.should.have.property('clientReportedFileExtension');
            res.body.clientReportedFileExtension.should.eq('.png');
            res.body.should.have.property('clientReportedMimeType');
            res.body.clientReportedMimeType.should.eq('image/png');
            res.body.should.have.property('createdAt');
            res.body.should.have.property('createdFrom');
            res.body.should.have.property('detectedFileExtension');
            res.body.should.have.property('detectedMimeType');
            res.body.should.have.property('destination');
            res.body.should.have.property('fieldName');
            res.body.should.have.property('originalName');
            res.body.should.have.property('path');
            res.body.should.have.property('destination');
            res.body.should.have.property('size');
            res.body.should.have.property('storage');
            expect(new Date(res.body.createdAt)).to.be.at.gte(timeBeforeAssetCreation);
            done();
          });
      });
    });
  });
  /*
   * Test the /DELETE /:asset route
   */
  describe('/DELETE /:asset', () => {
    it('it should delete the asset and then return a 404 when requesting the deleted asset', done => {
      createAsset('./test/rsrc/logo_agilitation.png').then(asset => {
        chai
          .request(context.campsi.app)
          .delete('/assets/' + asset.id)
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;

            // test was deleted, should send a 404
            chai
              .request(context.campsi.app)
              .get('/assets/{0}'.format(asset.id))
              .end((err, res) => {
                if (err) debug(`received an error from chai: ${err.message}`);
                res.should.have.status(404);
                done();
              });
          });
      });
    });
  });
});
