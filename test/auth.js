/**
 * Created by christophe on 23/08/17.
 */
//During the test the env variable is set to private
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

//Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const config = require('config');
const {btoa} = require('../lib/modules/base64');
const {createUser} = require('./helpers/createUser');
const debug = require('debug')('campsi:test');
const CampsiServer = require('campsi');
const {MongoClient} = require('mongodb');

let expect = chai.expect;
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);
chai.should();

const glenda = {
    displayName: 'Glenda Bennett',
    email: 'glenda@agilitation.fr',
    username: 'glenda',
    password: 'signup!'
};

const services = {
    Auth: require('../lib'),
    Trace: require('campsi-service-trace')
};

describe('Auth API', () => {
    beforeEach((done) => {
        MongoClient.connect(config.campsi.mongoURI).then((db) => {
            db.dropDatabase(() => {
                db.close();
                campsi = new CampsiServer(config.campsi);
                campsi.mount('auth', new services.Auth(config.services.auth));
                campsi.mount('trace', new services.Trace(config.services.trace));

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
        server.close(() => {
            done();
        });
    });
    /*
     * Test the /GET providers route
     */
    describe('/GET providers', () => {
        it('it should return a list of providers', (done) => {
            chai.request(campsi.app)
                .get('/auth/providers')
                .end((err, res) => {
                    res.should.have.status(200);
                    res.should.be.json;
                    res.body.should.be.a('array');
                    res.body.length.should.be.eq(1);
                    res.body[0].should.be.an('object');
                    res.body[0].should.have.property('name');
                    res.body[0].name.should.be.a('string');
                    res.body[0].name.should.be.eq('local');
                    done();
                });
        });
    });
    /*
     * Test the /GET me route
     */
    describe('/GET me [not connected]', () => {
        it('it should return an error when not connected', (done) => {
            chai.request(campsi.app)
                .get('/auth/me')
                .end((err, res) => {
                    res.should.have.status(503);
                    res.should.be.json;
                    res.body.should.be.a('object');
                    res.body.should.have.property('message');
                    done();
                });
        });
    });
    describe('/GET me [connected]', () => {
        it('it should return user when connected', (done) => {
            createUser(campsi, glenda, true).then((token) => {
                chai.request(campsi.app)
                    .get('/auth/me')
                    .set('Authorization', 'Bearer ' + token)
                    .end((err, res) => {
                        res.should.have.status(200);
                        res.should.be.json;
                        res.body.should.be.a('object');
                        res.body.should.have.property('displayName');
                        res.body.should.have.property('email');
                        res.body.should.have.property('identities');
                        res.body.should.have.property('token');
                        done();
                    });
            });
        });
    });
    /*
     * Test the /GET logout route
     */
    describe('/GET logout [not connected]', () => {
        it('it should return error if not connected', (done) => {
            chai.request(campsi.app)
                .get('/auth/logout')
                .end((err, res) => {
                    res.should.have.status(503);
                    res.should.be.json;
                    res.body.should.be.a('object');
                    res.body.should.have.property('message');
                    done();
                });
        });
    });
    describe('/GET logout [connected]', () => {
        it('it should return success & token must disappear from database', (done) => {
            createUser(campsi, glenda, true).then((token) => {
                chai.request(campsi.app)
                    .get('/auth/logout')
                    .set('Authorization', 'Bearer ' + token)
                    .end((err, res) => {
                        res.should.have.status(200);
                        res.should.be.json;
                        res.body.should.be.a('object');
                        res.body.should.have.property('message');
                        // bdd token must be undefined
                        let filter = {};
                        filter['token.value'] = token;
                        campsi.db.collection('__users__').findOne(filter).then((user) => {
                            expect(user).to.be.null;
                            done();
                        }).catch((error) => {
                            done(new Error(error));
                        });
                    });
            });
        });
    });
    /*
     * Test redirection
     */
    describe('redirection must redirect to correct page', () => {
        it('it shoud redirect on /me page on successful connection', (done) => {
            createUser(campsi, glenda).then(() => {
                let state = btoa(JSON.stringify({
                    redirectURI: '/auth/me'
                }));
                chai.request(campsi.app)
                    .post('/auth/local/signin?state=' + state)
                    .set('content-type', 'application/json')
                    .send({
                        username: 'glenda',
                        password: 'signup!'
                    })
                    .end((err, res) => {
                        res.should.have.status(200);
                        res.should.be.json;
                        res.body.should.be.a('object');
                        res.body.should.have.property('displayName');
                        res.body.should.have.property('email');
                        res.body.should.have.property('identities');
                        res.body.should.have.property('token');
                        done();
                    });
            });
        });
    });

    /*
     * Test redirection
     */
    describe('signin should return JSON when Ajax', () => {
        it('it should work', (done) => {
            createUser(campsi, glenda).then(() => {
                chai.request(campsi.app)
                    .post('/auth/local/signin')
                    .set('content-type', 'application/json')
                    .set('Referer', 'https://www.campsi.io')
                    .set('X-Requested-With', 'XMLHttpRequest')
                    .send({
                        username: 'glenda',
                        password: 'signup!'
                    })
                    .end((err, res) => {
                        res.should.have.status(200);
                        res.should.be.json;
                        res.body.should.be.a('object');
                        res.body.should.have.property('token');
                        done();
                    });
            });
        });
    });

    describe('send a PUT on /me should update the user', () => {
        it('it should modify the display name', (done) => {
            createUser(campsi, glenda, true).then((token) => {
                chai.request(campsi.app)
                    .put('/auth/me')
                    .set('content-type', 'application/json')
                    .set('Authorization', 'Bearer ' + token)
                    .send({
                        displayName: 'Eric Thomas'
                    })
                    .end((err, res) => {
                        res.should.have.status(200);
                        res.should.be.json;
                        res.should.be.a('object');
                        res.body.should.have.property('displayName');
                        res.body.displayName.should.equal('Eric Thomas');
                        done();
                    });
            });
        });

        it('it should add a data property', (done) => {
            createUser(campsi, glenda, true).then((token) => {
                chai.request(campsi.app)
                    .put('/auth/me')
                    .set('content-type', 'application/json')
                    .set('Authorization', 'Bearer ' + token)
                    .send({
                        data: {
                            stuffThatILike: ['trains']
                        }
                    })
                    .end((err, res) => {
                        res.should.have.status(200);
                        res.should.be.json;
                        res.should.be.a('object');
                        res.body.should.have.property('data');
                        res.body.data.should.be.a('object');
                        res.body.data.stuffThatILike.should.be.a('array');
                        done();
                    });
            });
        });
    });
});
