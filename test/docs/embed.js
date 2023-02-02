/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/docs/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const { MongoClient } = require('mongodb');
const mongoUriBuilder = require('mongo-uri-builder');
const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const builder = require('../../services/docs/lib/modules/queryBuilder');
const async = require('async');
const fakeId = require('fake-object-id');
const { emptyDatabase } = require('../helpers/emptyDatabase');

chai.should();
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);

const services = {
  Docs: require('../../services/docs/lib')
};

const owner = {
  _id: fakeId()
};

// Helpers
async function createArticle(title) {
  const category = campsi.services.get('docs').options.resources.categories;
  const article = campsi.services.get('docs').options.resources.articles;
  const ids = {};
  async.map(
    ['parent', 'other_1', 'other_2', 'other_3'],
    async (label, cb) => {
      const record = await builder.create({ user: owner, data: { label }, resource: category, state: 'published' });
      try {
        const result = await category.collection.insertOne(record);
        ids[label] = result.insertedId;
        cb();
      } catch (err) {
        return cb(null, err);
      }
    },
    async err => {
      if (err) {
        throw err;
      }
      const record = await builder.create({
        user: owner,
        data: {
          title,
          rels: {
            oneToOneRelationship: ids.parent.toString(),
            oneToManyRelationship: [ids.other_1.toString(), ids.other_2.toString(), ids.other_3.toString()]
          }
        },
        resource: article,
        state: 'published'
      });
      const result = await article.collection.insertOne(record);
      return result.insertedId.toString();
    }
  );
}

async function createEmptyArticle(title) {
  const article = campsi.services.get('docs').options.resources.articles;
  const record = await builder.create({
    user: owner,
    data: {
      title
    },
    resource: article,
    state: 'published'
  });
  const result = await article.collection.insertOne(record);
  return result.insertedId.toString();
}

// Our parent block
describe('Embedded Documents', () => {
  beforeEach(async done => {
    await emptyDatabase(config);

    campsi = new CampsiServer(config.campsi);
    campsi.mount('docs', new services.Docs(config.services.docs));
    campsi.app.use((req, res, next) => {
      req.user = owner;
      next();
    });

    campsi.on('campsi/ready', () => {
      server = campsi.listen(config.port);
      done();
    });
    campsi.start().catch(err => {
      debug('Error: %s', err);
    });
  });

  afterEach(done => {
    server.close();
    done();
  });
  /*
   * Test the /GET docs/articles/:id route for embed documents
   */
  describe('/GET docs/articles/:id', () => {
    it('it should return embeded documents (single)', done => {
      createArticle('My article')
        .then(id => {
          chai
            .request(campsi.app)
            .get(`/docs/articles/${id}?embed=parent_category`)
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.should.have.status(200);
              res.should.be.json;
              res.body.should.be.an('object');
              res.body.should.have.property('data').that.is.an('object');
              res.body.data.should.have.property('parent_category').that.is.an('object');
              res.body.data.parent_category.should.have.property('label').that.is.a('string');
              res.body.data.parent_category.label.should.be.eq('parent');
              res.body.data.should.not.have.property('other_categories');
              done();
            });
        })
        .catch(err => {
          throw err;
        });
    });
    it('it should return embeded documents (multiple)', done => {
      createArticle('My article')
        .then(id => {
          chai
            .request(campsi.app)
            .get(`/docs/articles/${id}?embed=other_categories`)
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.should.have.status(200);
              res.should.be.json;
              res.body.should.be.an('object');
              res.body.should.have.property('data').that.is.an('object');
              res.body.data.should.not.have.property('parent_category');
              res.body.data.should.have.property('other_categories').that.is.an('array');
              res.body.data.other_categories.should.have.lengthOf(3);
              ['other_1', 'other_2', 'other_3'].forEach((value, index) => {
                res.body.data.other_categories[index].should.be.an('object');
                res.body.data.other_categories[index].should.have.property('label').that.is.a('string');
                res.body.data.other_categories[index].label.should.be.eq(value);
              });
              done();
            });
        })
        .catch(err => {
          throw err;
        });
    });

    it('it should works if there is no resource to embed', done => {
      createEmptyArticle('My article')
        .then(id => {
          chai
            .request(campsi.app)
            .get(`/docs/articles/${id}?embed=parent_category&embed=other_categories`)
            .end((err, res) => {
              if (err) debug(`received an error from chai: ${err.message}`);
              res.should.have.status(200);
              res.should.be.json;
              res.body.should.be.an('object');
              res.body.should.have.property('data').that.is.an('object');
              res.body.data.should.not.have.property('parent_category');
              res.body.data.should.have.property('other_categories').that.is.an('array');
              res.body.data.other_categories.should.be.empty;
              done();
            });
        })
        .catch(err => {
          throw err;
        });
    });
  });
});
