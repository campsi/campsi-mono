//During the test the env variable is set to private
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

//Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const createUser = require('./helpers/createUser');
const setupBeforeEach = require('./helpers/setupBeforeEach');
const config = require('config');

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

const signin = (chai, campsi, username, password) => chai.request(campsi.app)
    .post('/auth/local/signin')
    .send({username: username, password: password});

const createResetPasswordToken = (chai, campsi, email) => chai.request(campsi.app)
    .post('/auth/local/reset-password-token')
    .send({email: email});

const resetUserPassword = (chai, campsi, username, passwordResetToken, newPassword) => chai.request(campsi.app)
    .post('/auth/local/reset-password')
    .send({
        username: username,
        token: passwordResetToken,
        password: newPassword
    });

describe('Auth Local Password Reset', () => {
    let context = {};
    beforeEach(setupBeforeEach(config, services, context));
    afterEach(done => context.server.close(done));
    /*
     * Test the /GET local/validate route
     */
    describe('/GET local/reset password [default]', () => {
        it('it should validate the user', done => {
            const campsi = context.campsi;
            const newPassword = 'newPassword';
            campsi.on('auth/local/passwordResetTokenCreated', user => {
                const passwordResetToken = user.identities.local.passwordResetToken.value;
                resetUserPassword(chai, campsi, glenda.username, passwordResetToken, newPassword).end((err, res) => {
                    res.should.have.status(200);
                    signin(chai, campsi, glenda.username, newPassword).end((err, res) => {
                        res.should.have.status(200);
                        res.should.be.json;
                        res.body.should.have.property('token');
                        done();
                    });
                });
            });

            createUser(chai, campsi, glenda).then(() => {
                createResetPasswordToken(chai, campsi, glenda.email)
                    .end((err, res) => {
                        res.should.have.status(200);
                        res.should.be.json;
                        res.body.should.be.a('object');
                    });
            });
        });
    });
});
