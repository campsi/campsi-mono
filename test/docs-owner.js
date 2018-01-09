//During the test the env variable is set to private
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'docs-owner';

//Require the dev-dependencies
const {MongoClient, Server} = require('mongodb');
const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const builder = require('../lib/modules/queryBuilder');
const fakeId = require('fake-object-id');

chai.should();
let expect = chai.expect;
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);

const services = {
    Docs: require('../lib'),
};

let me = {
    _id: fakeId()
};
let not_me = {
    _id: fakeId()
};

// Helpers
function createPizza(data, owner, state) {
    return new Promise(function (resolve, reject) {
        let resource = campsi.services.get('docs').options.resources['simple'];
        builder.create({
            user: owner,
            data: data,
            resource: resource,
            state: state
        }).then((doc) => {
            resource.collection.insert(doc, (err, result) => {
                resolve(result.ops[0]._id);
            });
        }).catch((error) => {
            reject(error);
        });
    });

}

// Our parent block
describe('Docs - Owner', () => {
    beforeEach((done) => {

        // Empty the database
        let client = new MongoClient(new Server(config.campsi.mongo.host, config.campsi.mongo.port));
        client.connect((error, mongoClient) => {
            let db = mongoClient.db(config.campsi.mongo.name);
            db.dropDatabase(() => {
                client.close();
                campsi = new CampsiServer(config.campsi);
                campsi.mount('docs', new services.Docs(config.services.docs));
                campsi.app.use((req, res, next) => {
                    req.user = me;
                    next();
                });

                campsi.on('campsi/ready', () => {
                    server = campsi.listen(config.port);
                    done();
                });

                campsi.start()
                    .catch((err) => {
                        debug('Error: %s', err);
                    });
            });
        });
    });

    afterEach((done) => {
        server.close();
        done();
    });

    /*
     * Test owner role
     */
    describe('owner role', () => {
        it('it should create a doc with correct owner', (done) => {
            let data = {'name': 'test'};
            chai.request(campsi.app)
                .post('/docs/simple/state-private')
                .set('content-type', 'application/json')
                .send(data)
                .end((err, res) => {
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
        it('it should not get a document not owned by current user', (done) => {
            let data = {'name': 'test'};
            createPizza(data, not_me, 'state-private').then((id) => {
                chai.request(campsi.app)
                    .get('/docs/simple/{0}/state-private'.format(id))
                    .end((err, res) => {
                        res.should.have.status(404);
                        res.should.be.json;
                        res.body.should.be.an('object');
                        res.body.should.have.property('message');
                        done();
                    });
            });
        });
        it('it should get a document owned by current user', (done) => {
            let data = {'name': 'test'};
            createPizza(data, me, 'state-private').then((id) => {
                chai.request(campsi.app)
                    .get('/docs/simple/{0}/state-private'.format(id))
                    .end((err, res) => {
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
        it('it should return an empty array if current user have not created any document', (done) => {
            let data = {name: 'test'};
            createPizza(data, not_me, 'state-private').then(() => {
                chai.request(campsi.app)
                    .get('/docs/simple')
                    .end((err,res) => {
                        res.should.have.status(200);
                        res.body.should.be.an('array');
                        res.body.should.have.length(0);
                        done();
                    });
            });
        });
    });
});
