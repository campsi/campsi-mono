/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const config = require('config');
const createUser = require('../helpers/createUser');
const debug = require('debug')('campsi:test');
const setupBeforeEach = require('../helpers/setupBeforeEach');
const { ObjectId, ObjectID } = require('mongodb');
const { use } = require('chai');
const expect = chai.expect;
format.extend(String.prototype);
chai.use(chaiHttp);
chai.should();

const createProject = function(id) {
  return {
    _id: new ObjectID(),
    users: {
      [id]: {
        roles: ['owner'],
        addedAt: new Date(),
        userId: id,
        displayName: 'James Lotery',
        infos: ''
      }
    },
    states: {
      published: {
        createdAt: new Date(),
        createdBy: new ObjectId(),
        data: {},
        modifiedAt: new Date(),
        modifiedBy: new ObjectID()
      }
    }
  };
};

const glenda = {
  displayName: 'Glenda Bennett',
  email: 'glenda@agilitation.fr',
  username: 'glenda',
  password: 'signup!',
  picture:
    // eslint-disable-next-line max-len
    'https://images.unsplash.com/photo-1536995769641-12e9f98fd223?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=687&q=80',
  data: {
    somedata: 'this is some data',
    somemoredata: 'this is some more data'
  }
};

const services = {
  Auth: require('../../services/auth/lib'),
  Trace: require('../../services/trace/lib'),
  Assets: require('../../services/assets/lib')
};

describe('Auth API', () => {
  const context = {};
  beforeEach(setupBeforeEach(config, services, context));
  afterEach(done => {
    context.server.close(done);
  });

  describe('delete a user', () => {
    it('should delete an existing user', done => {
      const campsi = context.campsi;
      const admin = {
        email: 'admin@campsi.io',
        username: 'admin@campsi.io',
        displayName: 'admin',
        password: 'password'
      };

      createUser(chai, campsi, admin, true).then(adminToken => {
        campsi.db
          .collection('__users__')
          .findOneAndUpdate({ email: admin.email }, { $set: { isAdmin: true } }, { returnDocument: 'after' })
          .then(updateResult => {
            createUser(chai, campsi, glenda).then(userToken => {
              chai
                .request(campsi.app)
                .get('/auth/users')
                .set('Authorization', 'Bearer ' + adminToken)
                .end((err, res) => {
                  if (err) {
                    debug(err);
                    return done();
                  }
                  res.should.have.status(200);

                  // glenda
                  const userId = res.body.filter(u => u.email === glenda.email)[0]._id;

                  const project = createProject(userId);

                  // insert fake __users__.user project with userId.displayName contaiting a filled in name
                  campsi.db
                    .collection('__users__')
                    .insertOne(project)
                    .then(result => {
                      // sepcify a field that needs to be anonymized in addition to the existing user data
                      chai
                        .request(campsi.app)
                        .patch(`/auth/users/soft-delete/${userId}`)
                        .set('Authorization', `Bearer ${adminToken}`)
                        .send({
                          additionalFieldName: `users.${userId}.displayName`,
                          additionalFieldCollectionName: '__users__'
                        })
                        .end((err, res) => {
                          debug(err);
                          const body = res.body;
                          res.should.have.status(200);
                          body.email.should.be.empty;
                          body.displayName.should.be.empty;
                          body.picture.should.be.empty;
                          expect(new Date(body.deletedOn).getTime()).to.be.closeTo(Date.now(), 1000);
                          Object.keys(body.data).length.should.be.equal(0);
                          Object.keys(body.identities).length.should.be.equal(0);

                          // make sure the extra field has been cleared out
                          campsi.db
                            .collection('__users__')
                            .findOne(project._id)
                            .then(result => {
                              // test that the displayName has been anonymized
                              expect(result.users[`${userId}`].displayName).to.be.empty;

                              // try and delete it again - should fail
                              chai
                                .request(campsi.app)
                                .patch(`/auth/users/soft-delete/:${userId}`)
                                .set('Authorization', `Bearer ${adminToken}`)
                                .end((err, res) => {
                                  debug(err);
                                  debug(res.body);
                                  res.should.have.status(400);
                                  done();
                                });
                            });
                        });
                    })
                    .catch(err => {
                      console.log(err);
                    });
                });
            });
          });
      });
    });

    it('should not allow us to delete an existing user if we are not admin', done => {
      const campsi = context.campsi;
      const admin = {
        email: 'admin@campsi.io',
        username: 'admin@campsi.io',
        displayName: 'admin',
        password: 'password'
      };
      createUser(chai, campsi, admin, true).then(adminToken => {
        campsi.db
          .collection('__users__')
          .findOneAndUpdate({ email: admin.email }, { $set: { isAdmin: true } }, { returnDocument: 'after' })
          .then(updateResult => {
            createUser(chai, campsi, glenda).then(userToken => {
              chai
                .request(campsi.app)
                .get('/auth/users')
                .set('Authorization', 'Bearer ' + adminToken)
                .end((err, res) => {
                  if (err) {
                    debug(err);
                    return done();
                  }

                  // delete with glenda's profile (not admin)
                  const userId = res.body.filter(u => u.email === glenda.email)[0]._id;
                  chai
                    .request(campsi.app)
                    .patch(`/auth/users/soft-delete/${userId}`)
                    .set('Authorization', `Bearer ${userToken}`)
                    .end((_err, res) => {
                      res.should.have.status(401);
                      done();
                    });
                });
            });
          });
      });
    });
  });
});
