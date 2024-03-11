/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const builder = require('../../services/docs/lib/modules/queryBuilder');
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
async function createData() {
  const category = campsi.services.get('docs').options.resources.categories;
  const entries = [
    { label: 'first label', price: 10, start: new Date('2022-05-09') },
    { label: 'second label', price: 20, start: new Date('2022-05-10'), visible: false, unique: true },
    { label: 'third label', price: 30, start: new Date('2022-05-11'), visible: true }
  ];

  const createdRecords = [];
  for await (const data of entries) {
    const record = await builder.create({ user: owner, data, resource: category, state: 'published' });
    createdRecords.push(await category.collection.insertOne(record));
  }
  return createdRecords;
}

function testResponse(response, length) {
  response.should.have.status(200);
  response.should.be.json;
  response.body.should.be.an('array');
  response.body.should.have.lengthOf(length);
}

function testDocument(document, index) {
  document.should.be.an('object');
  document.should.have.property('data').that.is.an('object');
  document.data.should.have.property('label').that.is.a('string');
  document.data.label.should.be.eq(`${['first', 'second', 'third'][index]} label`);
}

// Our parent block
describe('Filter Documents', () => {
  beforeEach(done => {
    emptyDatabase(config).then(() => {
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
  });

  afterEach(done => {
    server.close();
    done();
  });

  describe('Simple Match', () => {
    it('it should return first document', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.label=first label')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 1);
            testDocument(res.body[0], 0);
            resolve();
          });
      });
    });
  });

  describe('Multiple match (in operator)', () => {
    it('it should return first & second document', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.label=first label&data.label=second label')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 2);
            testDocument(res.body[0], 0);
            testDocument(res.body[1], 1);
            resolve();
          });
      });
    });
  });

  describe('Starts With', () => {
    it('it should return second document', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.label[starts-with]=second')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 1);
            testDocument(res.body[0], 1);
            resolve();
          });
      });
    });
  });

  describe('Ends With', () => {
    it('it should return third document', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.label[ends-with]=rd label')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 1);
            testDocument(res.body[0], 2);
            resolve();
          });
      });
    });
  });

  describe('Contains', () => {
    it('it should return first document', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.label[contains]=rst')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 1);
            testDocument(res.body[0], 0);
            resolve();
          });
      });
    });
  });

  describe('Number eq', () => {
    it('it should return first document', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.price[eq]=10')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 1);
            testDocument(res.body[0], 0);
            resolve();
          });
      });
    });
  });

  describe('Number lt', () => {
    it('it should return first & second documents', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.price[lt]=30')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 2);
            testDocument(res.body[0], 0);
            testDocument(res.body[1], 1);
            resolve();
          });
      });
    });
  });

  describe('Number gt', () => {
    it('it should return second and third documents', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.price[gt]=10')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 2);
            testDocument(res.body[0], 1);
            testDocument(res.body[1], 2);
            resolve();
          });
      });
    });
  });

  describe('Number lte', () => {
    it('it should return first & second documents', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.price[lte]=20')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 2);
            testDocument(res.body[0], 0);
            testDocument(res.body[1], 1);
            resolve();
          });
      });
    });
  });

  describe('Number gte', () => {
    it('it should return second & third documents', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.price[gte]=20&sort=_id')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 2);
            testDocument(res.body[0], 1);
            testDocument(res.body[1], 2);
            resolve();
          });
      });
    });
  });

  describe('Number in', () => {
    it('it should return first & third documents', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.price[in]=10,30&sort=_id')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 2);
            testDocument(res.body[0], 0);
            testDocument(res.body[1], 2);
            resolve();
          });
      });
    });
  });

  describe('Date before', () => {
    it('it should return first document', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.start[before]=2022-05-10')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 1);
            testDocument(res.body[0], 0);
            resolve();
          });
      });
    });
  });

  describe('Date after', () => {
    it('it should return third document', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.start[after]=2022-05-10')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 1);
            testDocument(res.body[0], 2);
            resolve();
          });
      });
    });
  });

  describe('Boolean', () => {
    it('it should return third document', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.visible[bool]=TrUe')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 1);
            testDocument(res.body[0], 2);
            resolve();
          });
      });
    });
    it('it should return second document', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.visible[bool]=FaLsE')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 1);
            testDocument(res.body[0], 1);
            resolve();
          });
      });
    });
  });

  describe('Exists', () => {
    it('it should return second & third documents', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.unique[exists]=TrUe')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 1);
            testDocument(res.body[0], 1);
            resolve();
          });
      });
    });
    it('it should return first document', async () => {
      await createData();
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .get('/docs/categories?data.visible[exists]=FaLsE')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 1);
            testDocument(res.body[0], 0);
            resolve();
          });
      });
    });
  });

  describe('Filter by Ids', () => {
    it('it should return first & third documents', async () => {
      const createdRecords = await createData();
      const ids = [createdRecords[0].insertedId, createdRecords[2].insertedId];
      return new Promise(resolve => {
        chai
          .request(campsi.app)
          .post('/docs/categories/documents:get')
          .send({ ids })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            testResponse(res, 2);
            testDocument(res.body[0], 0);
            testDocument(res.body[1], 2);
            resolve();
          });
      });
    });
  });
});
