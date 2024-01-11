/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/docs/config';
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
const expect = chai.expect;
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);

const services = {
  Auth: require('../../services/auth/lib'),
  Docs: require('../../services/docs/lib')
};

const me = {
  _id: fakeId()
};
const notMe = {
  _id: fakeId()
};

// Helpers
async function createEntry(data, owner, state) {
  const resource = campsi.services.get('docs').options.resources.simple;
  const doc = await builder.create({ user: owner, data, resource, state });
  const result = await resource.collection.insertOne(doc);
  return result.insertedId;
}

// Our parent block
describe('Owner', () => {
  beforeEach(done => {
    emptyDatabase(config).then(() => {
      campsi = new CampsiServer(config.campsi);
      Object.entries(services).map(([name, service]) => {
        // eslint-disable-next-line new-cap
        return campsi.mount(name.toLowerCase(), new service(config.services[name.toLowerCase()]));
      });
      campsi.app.use((req, res, next) => {
        req.user = me;
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

  /*
   * Test owner role
   */
  describe('owner role', () => {
    it('it should create a doc with correct owner', done => {
      const data = { name: 'test' };
      chai
        .request(campsi.app)
        .post('/docs/simple/state-private')
        .set('content-type', 'application/json')
        .send(data)
        .end((err, res) => {
          if (err) debug(`received an error from chai: ${err.message}`);
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.have.property('id');
          res.body.should.have.property('state');
          res.body.state.should.be.eq('state-private');
          res.body.should.have.property('id');
          res.body.should.have.property('createdAt');
          res.body.should.have.property('createdBy');
          expect(res.body.createdBy).to.be.eql(me._id);
          res.body.should.have.property('data');
          res.body.data.should.be.eql(data);
          done();
        });
    });
    it('it should not get a document not owned by current user', done => {
      const data = { name: 'test' };
      createEntry(data, notMe, 'state-private').then(id => {
        chai
          .request(campsi.app)
          .get('/docs/simple/{0}/state-private'.format(id))
          .end((err, res) => {
            debug(res.body, res.status);
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(404);
            res.should.be.json;
            res.body.should.be.an('object');
            res.body.should.have.property('message');
            done();
          });
      });
    });
    it('it should get a document owned by current user', done => {
      const data = { name: 'test' };
      createEntry(data, me, 'state-private').then(id => {
        chai
          .request(campsi.app)
          .get('/docs/simple/{0}/state-private'.format(id))
          .end((err, res) => {
            debug(res.status, res.body);
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.should.be.json;
            res.body.should.be.an('object');
            res.body.should.have.property('id');
            res.body.should.have.property('state');
            res.body.state.should.be.eq('state-private');
            res.body.should.have.property('createdAt');
            res.body.should.have.property('createdBy');
            res.body.createdBy.should.be.equal(me._id);
            res.body.should.have.property('data');
            res.body.data.should.be.eql(data);
            done();
          });
      });
    });
    it('it should return an empty array if not on the good state', done => {
      const data = { name: 'test' };
      createEntry(data, notMe, 'state-private').then(() => {
        chai
          .request(campsi.app)
          .get('/docs/simple')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.body.should.be.an('array');
            res.body.should.have.length(0);
            done();
          });
      });
    });
    it('it should return an empty array if current user have not created any document', done => {
      const data = { name: 'test' };
      createEntry(data, notMe, 'state-private').then(() => {
        chai
          .request(campsi.app)
          .get('/docs/simple?state=state-private')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.body.should.be.an('array');
            res.body.should.have.length(0);
            done();
          });
      });
    });
    it('it should not return an empty array if current user have created a document', done => {
      const data = { name: 'test' };
      createEntry(data, me, 'state-private').then(() => {
        chai
          .request(campsi.app)
          .get('/docs/simple?state=state-private')
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.body.should.be.an('array');
            res.body.should.have.length(1);
            done();
          });
      });
    });
    it('it should return the list of users', done => {
      const data = { name: 'test' };
      createEntry(data, me, 'state-private').then(id => {
        chai
          .request(campsi.app)
          .get(`/docs/simple/${id}/users`)
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.body.should.be.an('array');
            res.body.should.have.length(1);
            res.body[0].roles[0].should.eq('owner');
            done();
          });
      });
    });
    it('it should add and remove users', done => {
      const data = { name: 'test' };
      createEntry(data, me, 'state-private').then(id => {
        chai
          .request(campsi.app)
          .post(`/docs/simple/${id}/users`)
          .send({
            roles: ['owner'],
            userId: notMe._id,
            displayName: 'Not me',
            infos: { message: 'userInfo' }
          })
          .end((err, res) => {
            if (err) debug(`received an error from chai: ${err.message}`);
            res.should.have.status(200);
            res.body.should.be.an('array');
            res.body.should.have.length(2);
            res.body[1].roles[0].should.eq('owner');
            res.body[1].should.have.property('infos');
            chai
              .request(campsi.app)
              .delete(`/docs/simple/${id}/users/${notMe._id}`)
              .end((err, res) => {
                if (err) debug(`received an error from chai: ${err.message}`);
                res.should.have.status(200);
                res.body.should.be.an('array');
                res.body.should.have.length(1);
                done();
              });
          });
      });
    });
  });
});
