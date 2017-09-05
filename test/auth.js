/**
 * Created by christophe on 23/08/17.
 */
//During the test the env variable is set to private
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';
process.env.DEBUG='campsi, campsi:auth, campsi:test';

//Require the dev-dependencies
const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const CryptoJS = require('crypto-js');
const uuid = require('uuid');

let should = chai.should();
let expect = chai.expect;
let assert = chai.assert;
let campsi;
format.extend(String.prototype);
chai.use(chaiHttp);

const services = {
    Auth: require('../lib'),
};

// Helpers
function createUser(data, connect) {
    connect = typeof connect  !== 'undefined' ? connect : false;
    return new Promise(function (resolve, reject) {
        const localProvider = campsi.services['auth'].options.providers.local;
        const encryptedPassword = CryptoJS.AES.encrypt(
            data.password,
            localProvider.options.salt
        ).toString();

        let user = {
            displayName: data.displayName,
            email: data.email || data.username,
            identities: {
                local: {
                    id: data.username,
                    username: data.username,
                    password: encryptedPassword
                }
            }
        };

        let exp = new Date();
        exp.setTime(exp.getTime() + 10 * 86400000);
        var token = {
            value: uuid(),
            expiration: exp
        };
        if(connect) {
            user.token = token;
        }

        campsi.db.collection('__users__').insertOne(user)
            .then((result) => {
            if(connect) {
                resolve(token.value);
            } else {
                resolve(result.insertedId);
            }
        }).catch((err) => reject(err));
    });
}

// Our parent block
describe('Auth', () => {
    beforeEach((done) => { //Before each test we empty the database
        campsi = new CampsiServer(config.campsi);

        campsi.mount('auth', new services.Auth(config.services.auth));
        campsi.on('ready', () => {
            campsi.db.dropDatabase();
            done();
        });
        campsi.start()
            .catch((err) => {
                debug('Error: %s', err);
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
            createUser({
                displayName: 'Glenda Bennett',
                email: 'glenda@agilitation.fr',
                username: 'glenda',
                password: 'signup!'
            }, true).then((token) => {
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
            createUser({
                displayName: 'Glenda Bennett',
                email: 'glenda@agilitation.fr',
                username: 'glenda',
                password: 'signup!'
            }, true).then((token) => {
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
     * Test the /POST local/signup route
     */
    describe('/POST local/signup [bad parameters]', () => {
        it('it should return an error', (done) => {
            chai.request(campsi.app)
                .post('/auth/local/signup')
                .set('content-type', 'application/json')
                .send({
                    bad: 'parameters'
                })
                .end((err, res) => {
                    res.should.have.status(400);
                    res.should.be.json;
                    res.body.should.be.a('object');
                    res.body.should.have.property('message');
                    done();
                });
        });
    });
    describe('/POST local/signup [user already exists]', () => {
        it('it should return an error', (done) => {
            createUser({
                displayName: 'Glenda Bennett',
                email: 'glenda@agilitation.fr',
                username: 'glenda',
                password: 'signup!'
            }).then(() => {
                chai.request(campsi.app)
                    .post('/auth/local/signup')
                    .set('content-type', 'application/json')
                    .send({
                        displayName: 'Glenda Bennett',
                        email: 'glenda@agilitation.fr',
                        username: 'christophe',
                        password: 'signup!'
                    })
                    .end((err, res) => {
                        res.should.have.status(400);
                        res.should.be.json;
                        res.body.should.be.a('object');
                        res.body.should.have.property('message');
                        done();
                    });
            });
        });
    });
    describe('/POST local/signup [default]', () => {
        it('it should do something', (done) => {
            chai.request(campsi.app)
                .post('/auth/local/signup')
                .set('content-type', 'application/json')
                .send({
                    displayName: 'Glenda Bennett',
                    email: 'glenda@agilitation.fr',
                    username: 'glenda',
                    password: 'signup!'
                })
                .end((err, res) => {
                    res.should.have.status(200);
                    res.should.be.json;
                    res.body.should.be.a('object');
                    res.body.should.have.property('token');
                    res.body.token.should.be.a('string');
                    done();
                });
        });
    });
    /*
     * Test the /POST local/signin route
     */
    describe('/POST local/signin [bad paramaters]', () => {
        it('it should return an error', (done) => {
            createUser({
                displayName: 'Glenda Bennett',
                email: 'glenda@agilitation.fr',
                username: 'glenda',
                password: 'signup!'
            }).then(() => {
                chai.request(campsi.app)
                    .post('/auth/local/signin')
                    .set('content-type', 'application/json')
                    .send({
                        bad: 'parameters'
                    })
                    .end((err, res) => {
                        res.should.have.status(400);
                        res.should.be.json;
                        res.body.should.be.a('object');
                        res.body.should.have.property('message');
                        done();
                    });
            });
        });
    });
    describe('/POST local/signin [bad credentials]', () => {
        it('it should sign in the user', (done) => {
            createUser({
                displayName: 'Glenda Bennett',
                email: 'glenda@agilitation.fr',
                username: 'glenda',
                password: 'signup!'
            }).then(() => {
                chai.request(campsi.app)
                    .post('/auth/local/signin')
                    .set('content-type', 'application/json')
                    .send({
                        username: 'glenda',
                        password: 'wrong!'
                    })
                    .end((err, res) => {
                        res.should.have.status(400);
                        res.should.be.json;
                        res.body.should.be.a('object');
                        res.body.should.have.property('message');
                        done();
                    });
            });
        });
    });
    describe('/POST local/signin [default]', () => {
        it('it should sign in the user', (done) => {
            createUser({
                displayName: 'Glenda Bennett',
                email: 'glenda@agilitation.fr',
                username: 'glenda',
                password: 'signup!'
            }).then(() => {
                chai.request(campsi.app)
                    .post('/auth/local/signin')
                    .set('content-type', 'application/json')
                    .send({
                        username: 'glenda',
                        password: 'signup!'
                    })
                    .end((err, res) => {
                        res.should.have.status(200);
                        res.should.be.json;
                        res.body.should.be.a('object');
                        res.body.should.have.property('token');
                        res.body.token.should.be.a('string');
                        done();
                    });
            });
        });
    });
    /*
     * Test the /POST local/reset-password route
     */
    describe('/POST local/reset-password [bad parameters]', () => {
        it('it should return an error with bad parameters', (done) => {
            createUser({
                displayName: 'Glenda Bennett',
                email: 'glenda@agilitation.fr',
                username: 'glenda',
                password: 'signup!'
            }, true).then((token) => {
                chai.request(campsi.app)
                    .post('/auth/local/reset-password')
                    .set('content-type', 'application/json')
                    .set('Authorization', 'Bearer ' + token)
                    .send({
                        bad: 'parameter'
                    })
                    .end((err, res) => {
                        res.should.have.status(400);
                        res.should.be.json;
                        res.body.should.be.a('object');
                        res.body.should.have.property('message');
                        done();
                    });
            });
        });
    });
    describe('/POST local/reset-password [bad credentials]', () => {
        it('it should return an error with bad credentials', (done) => {
            chai.request(campsi.app)
                .post('/auth/local/reset-password')
                .set('content-type', 'application/json')
                .send({
                    password: 'signup!'
                })
                .end((err, res) => {
                    res.should.have.status(503);
                    res.should.be.json;
                    res.body.should.be.a('object');
                    res.body.should.have.property('message');
                    done();
                });
        });
    });
    describe('/POST local/reset-password [default]', () => {
        it('it should sign in the user', (done) => {
            createUser({
                displayName: 'Glenda Bennett',
                email: 'glenda@agilitation.fr',
                username: 'glenda',
                password: 'signup!'
            }, true).then((token) => {
                chai.request(campsi.app)
                    .post('/auth/local/reset-password')
                    .set('content-type', 'application/json')
                    .set('Authorization', 'Bearer ' + token)
                    .send({
                        password: 'mypassword!'
                    })
                    .end((err, res) => {
                        res.should.have.status(200);
                        res.should.be.json;
                        res.body.should.be.a('object');
                        res.body.should.have.property('token');
                        res.body.token.should.be.a('string');
                        done();
                    });
            });
        });
    });
});
