/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const debug = require('debug')('campsi:test');
const chai = require('chai');
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
  let context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => {
    context.server.close(done);
  });

  function createAsset(source) {
    return new Promise(function(resolve, reject) {
      const localStorage = context.campsi.services.get('assets').config.options
        .storages.local;
      const originalName = path.basename(source);
      const storageName = uniqueSlug('');
      const stats = fs.statSync(source);

      let file = {
        fieldName: 'file',
        originalName: originalName,
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
            .then(cb)
            .catch(err => {
              if (err) {
                process.exit(1);
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
    it.skip('it should return a list of assets', done => {
      createAssets(Array(5).fill('../rsrc/logo_agilitation.png')).then(
        () => {
          chai
            .request(context.campsi.app)
            .get('/assets/')
            // .query({ page: 3, perPage: 2 })
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.should.have.status(200);
              res.should.have.header('x-total-count', '5');
              res.should.have.header('link');
              res.should.be.json;
              res.body.should.be.an('array');
              res.body.length.should.be.eq(1);
              done();
            });
        }
      );
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
          url:
            'https://uploads-ssl.webflow.com/5d5f94b1c701ded9b6298526/5d5f994938c00e4777ad545a_Logo-axeptio-galet_500.png'
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
   * Test the /POST / route
   */
  describe('/POST /', () => {
    it('it should return ids of uploaded files', done => {
      chai
        .request(context.campsi.app)
        .post('/assets')
        .attach(
          'file',
          fs.readFileSync('./test/rsrc/logo_agilitation.png'),
          'logo_agilitation.png'
        )
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
  /*
   * Test the /GET /:asset/metadata route
   */
  describe('/GET /:asset/metadata', () => {
    it('it should return the asset metadata', done => {
      createAsset('./test/rsrc/logo_agilitation.png').then(asset => {
        chai
          .request(context.campsi.app)
          .get('/assets/{0}/metadata'.format(asset.id))
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            // TODO test metadata
            done();
          });
      });
    });
  });
  /*
   * Test the /DELETE /:asset route
   */
  describe('/DELETE /:asset', () => {
    it('it should return the asset metadata', done => {
      createAsset('./test/rsrc/logo_agilitation.png').then(asset => {
        chai
          .request(context.campsi.app)
          .delete('/assets/' + asset.id)
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            // TODO test deletion and return
            done();
          });
      });
    });
  });
});
