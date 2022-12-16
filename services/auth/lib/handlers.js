const helpers = require('../../../lib/modules/responseHelpers');
const { getValidGroupsFromString } = require('../../../lib/modules/groupsHelpers');
const builder = require('./modules/queryBuilder');
const passport = require('@passport-next/passport');
const editURL = require('edit-url');
const state = require('./state');
const debug = require('debug')('campsi:service:auth');
const { ObjectId } = require('mongodb');
const { deleteExpiredTokens } = require('./tokens');
const { getUsersCollectionName } = require('./modules/collectionNames');
const { verifyOtpCode, sendOtpCode } = require('./mfaHandlers');

async function tokenMaintenance(req, res) {
  if (!req?.user?.isAdmin) {
    return helpers.unauthorized(res);
  }

  // this aggregation only returns users that have expired tokens to archive
  if (req?.query?.action === 'deleteExpiredTokens') {
    const aggregation = [
      {
        $project: {
          user: '$$ROOT',
          expiredTokens: {
            $filter: {
              input: { $objectToArray: '$$ROOT.tokens' },
              as: 'tokens',
              cond: {
                $lte: ['$$tokens.v.expiration', '$$NOW']
              }
            }
          }
        }
      },
      {
        $project: {
          user: 1,
          expiredTokens: 1,
          tokens: {
            $gt: [
              {
                $size: '$expiredTokens'
              },
              1
            ]
          }
        }
      },
      {
        $match: {
          tokens: true
        }
      },
      {
        $project: {
          user: 1
        }
      }
    ];

    const cursor = req.db.collection('__users__').aggregate(aggregation);

    for await (const user of cursor) {
      try {
        await deleteExpiredTokens(user.user.tokens, user._id, req.db);
      } catch (e) {
        console.log(e);
      }
    }

    res.json();
  } else {
    return helpers.badRequest(res);
  }
}
function logout(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  const update = { $set: { token: 'null' } };

  const usersCollection = req.db.collection(getUsersCollectionName());
  const token = req.authBearerToken;
  const user = req.user;

  usersCollection
    .findOneAndUpdate({ _id: user._id }, update)
    .then(result => {
      // move current token from tokens and archive it
      // except if marked "doNotDelete".
      usersCollection
        .findOneAndUpdate(
          { _id: user._id, [`tokens.${token}.doNotDelete`]: { $exists: false } },
          { $unset: { [`tokens.${token}`]: '' } },
          { returnDocument: 'before' }
        )
        .then(result => {
          // move old token to __users__.tokens_log
          if (result && result.value) {
            const tokenToArchive = {
              [`${token}`]: {
                userId: user._id,
                ...result.value.tokens[token]
              }
            };

            req.db
              .collection(`${getUsersCollectionName()}.tokens_log`)
              .insertOne(tokenToArchive)
              .then(() => {
                return res.json({ message: 'signed out' });
              })
              .catch(err => {
                return res.status(500).json({ message: err });
              });
          } else {
            return res.json({ message: 'user not signed out' });
          }
        });
    })
    .catch(error => {
      return helpers.error(res, error);
    });
}

function me(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }
  delete req.user.identities?.local?.encryptedPassword;

  res.json(req.user);

  req.db
    .collection(getUsersCollectionName())
    .findOneAndUpdate({ _id: req.user._id }, { $set: { lastSeenAt: new Date() } }, {})
    .then(_result => {})
    .catch(error => helpers.error(res, error));
}

function updateMe(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  const allowedProps = ['displayName', 'data', 'identities', 'email'];
  const update = { $set: {} };

  allowedProps.forEach(prop => {
    if (req.body[prop]) {
      update.$set[prop] = req.body[prop];
    }
  });

  req.db
    .collection(getUsersCollectionName())
    .findOneAndUpdate({ _id: req.user._id }, update, {
      returnDocument: 'after',
      projection: { 'identities.local.encryptedPassword': 0 }
    })
    .then(result => res.json(result.value))
    .catch(error => helpers.error(res, error));
}

function patchMe(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  const allowedProps = ['displayName', 'data', 'identities', 'email'];
  const update = { $set: {} };

  for (const [key, value] of Object.entries(req.body)) {
    if (allowedProps.filter(prop => key.startsWith(prop)).length && !!value) {
      update.$set[key] = value;
    }
  }

  req.db
    .collection(getUsersCollectionName())
    .findOneAndUpdate({ _id: req.user._id }, update, {
      returnDocument: 'after'
    })
    .then(result => res.json(result.value))
    .catch(error => helpers.error(res, error));
}

async function updateUserTokenStatus(db, user, token, tokenStatus) {
  if (user) {
    const update = { $set: { [`tokens.${token}.status`]: tokenStatus } };

    try {
      const result = await db.collection(getUsersCollectionName()).findOneAndUpdate({ _id: user._id }, update, {
        returnDocument: 'after'
      });

      return result.value;
    } catch (ex) {
      debug(ex);
    }
  }
}

function createAnonymousUser(req, res) {
  const token = builder.genBearerToken(100);
  const insert = {
    identities: {},
    tokens: {
      [token.value]: {
        expiration: token.expiration,
        grantedByProvider: 'anonymous'
      }
    },
    email: token.value,
    token: token.value,
    createdAt: new Date()
  };
  req.db
    .collection(getUsersCollectionName())
    .insertOne(insert)
    .then(insertResult => {
      res.json({ _id: insertResult.insertedId, ...insert });
    });
}

function getProviders(req, res) {
  const ret = [];
  // eslint-disable-next-line array-callback-return
  Object.entries(req.authProviders).map(([name, provider]) => {
    ret.push({
      name,
      title: provider.title,
      buttonStyle: provider.buttonStyle,
      scope: provider.scope
    });
  });

  ret.sort((a, b) => a.order - b.order);
  res.json(ret);
}

function callback(req, res) {
  const { redirectURI } = state.get(req);

  // noinspection JSUnresolvedFunction
  passport.authenticate(req.authProvider.name, {
    session: false,
    failWithError: true
  })(req, res, async () => {
    if (!req.user) {
      return redirectWithError(req, res, new Error('unable to authentify user'));
    }
    if (!redirectURI) {
      try {
        const mfa = { mode: undefined, to: undefined, mfaStatus: undefined };

        mfa.mode = req.user.data?.authenticationPreference?.mode;
        if (mfa.mode) {
          switch (mfa.mode) {
            case 'sms':
            case 'call': {
              mfa.to = req.user.data.phone;
              break;
            }
            case 'totp': {
              mfa.to = req.user.email;
              break;
            }
            case 'email': {
              mfa.to = req.user.email;
              break;
            }
          }

          // update the token with pending status
          await updateUserTokenStatus(req.db, req.user, req.authBearerToken, 'pending');
          mfa.mfaStatus = await sendOtpCode(mfa.to, mfa.mode, req.verifyClient)?.status;
        }

        res.json({ token: req.authBearerToken, mfa });
      } catch (err) {
        debug('Catching headers', err);
      }
    } else {
      res.redirect(
        editURL(redirectURI, obj => {
          obj.query.access_token = req.authBearerToken;
        })
      );
    }
    if (req.session) {
      req.session.destroy(() => {
        debug('session destroyed');
      });
    }
  });
}

function redirectWithError(req, res, err) {
  const { redirectURI } = state.get(req);
  if (!redirectURI) {
    helpers.error(res, err);
  } else {
    res.redirect(
      editURL(redirectURI, obj => {
        obj.query.error = true;
      })
    );
  }
}

function verifyMFACode(req, res) {
  const result = verifyOtpCode(req.to, req.code, req.verifyClient);
  res.json(result);
}

function getUserFilterFromQuery(query) {
  const filter = {};
  if (query.provider) {
    filter[`identities.${query.provider}`] = { $exists: true };
  }
  if (query.email) {
    filter.email = query.email;
  }
  if (query.userId) {
    try {
      filter._id = new ObjectId(query.userId);
    } catch (e) {
      debug('erroneous ObjectId', query.userId);
      return { _id: null };
    }
  }
  return filter;
}
async function getUsers(req, res) {
  if (req.user && req.user.isAdmin) {
    try {
      const users = await req.db
        .collection(getUsersCollectionName())
        .find(getUserFilterFromQuery(req.query), {
          projection: { 'identities.local.encryptedPassword': 0 }
        })
        .toArray();
      return res.json(users);
    } catch (err) {
      return redirectWithError(req, res, err);
    }
  } else {
    redirectWithError(req, res, new Error('Only admin users are allowed to show users'));
  }
}

function getAccessTokenForUser(req, res) {
  if (req.user && req.user.isAdmin) {
    let userId;
    try {
      userId = new ObjectId(req.params.userId);
    } catch (e) {
      return redirectWithError(req, res, new Error('Erroneous userId'));
    }
    const { update, updateToken } = builder.genUpdate({ name: 'impersonatingByAdmin' }, {});
    req.db
      .collection(getUsersCollectionName())
      .findOneAndUpdate({ _id: userId }, update, {
        returnDocument: 'after'
      })
      .then(result => {
        if (result.value) {
          if (!req.query.redirectURI) {
            return res.json({ token: updateToken.value });
          }
          res.redirect(
            editURL(req.query.redirectURI, url => {
              url.query.access_token = updateToken.value;
            })
          );
        } else {
          helpers.notFound(res, new Error('Unknown user'));
        }
      });
  } else {
    redirectWithError(req, res, new Error('Only admin users are allowed to show users'));
  }
}
/**
 * Entry point of the authentification workflow.
 * There's no req.user yet.
 *
 * @param req
 * @param res
 * @param next
 */
function initAuth(req, res, next) {
  const params = {
    session: false,
    state: state.serialize(req),
    scope: req.authProvider.scope
  };
  debug(params, req.authProvider);
  // noinspection JSUnresolvedFunction
  passport.authenticate(req.params.provider, params)(req, res, next);
}

function inviteUser(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res, new Error('You must be authentified to send an invitation'));
  }
  const invitationToken = builder.genBearerToken(100);
  const dispatchInvitationEvent = function (payload) {
    req.service.emit('invitation/created', payload);
  };
  const filter = {
    email: new RegExp('^' + req.body.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
  };
  const update = { $set: { updatedAt: new Date() } };

  const groups = req?.query?.groups ? getValidGroupsFromString(req.query.groups) : [];

  if (groups.length) {
    update.$addToSet = { groups: { $each: groups } };
  }
  // if user exists with the given email, we return the id
  req.db.collection(getUsersCollectionName()).findOneAndUpdate(filter, update, { returnDocument: 'after' }, (err, result) => {
    if (err) {
      return helpers.error(res, err);
    }
    if (result.value) {
      const doc = result.value;
      res.json({ id: doc._id.toString(), invitationToken });
      return dispatchInvitationEvent({
        id: doc._id,
        email: doc.email,
        invitedBy: req.user._id,
        token: invitationToken,
        requestBody: req.body,
        requestHeaders: req.headers
      });
    } else {
      const invitationToken = builder.genBearerToken(100);
      const provider = {
        name: `invitation-${invitationToken.value}`,
        expiration: 20
      };
      const profile = {
        email: req.body.email,
        displayName: req.body.displayName,
        identity: {
          invitedBy: req.user._id,
          token: invitationToken,
          data: req.body.data
        }
      };

      const { insert, insertToken } = builder.genInsert(provider, profile);
      if (groups.length) {
        insert.groups = groups;
      }
      req.db.collection(getUsersCollectionName()).insertOne(insert, (err, result) => {
        if (err) {
          return helpers.error(res, err);
        }
        res.json({ id: result.insertedId, insertToken, invitationToken });
        dispatchInvitationEvent({
          id: result.insertedId,
          email: profile.email,
          invitedBy: req.user._id,
          token: invitationToken,
          requestBody: req.body,
          requestHeaders: req.headers
        });
      });
    }
  });
}

function acceptInvitation(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res, new Error('You must be authentified to accept an invitation'));
  }
  const query = {
    [`identities.invitation-${req.params.invitationToken}.token.expiration`]: {
      $gt: new Date()
    }
  };
  req.db.collection(getUsersCollectionName()).findOneAndUpdate(
    query,
    {
      $unset: { [`identities.invitation-${req.params.invitationToken}`]: true }
    },
    {
      returnDocument: 'before'
    },
    (err, updateResult) => {
      if (err) return helpers.error(res, err);
      const doc = updateResult.value;
      if (!doc) {
        debug('No user was found nor updated in query', query);
        return helpers.notFound(res, new Error('No user was found with this invitation token'));
      }
      const invitation = doc.identities[`invitation-${req.params.invitationToken}`];
      const payload = {
        userId: req.user._id,
        invitedUserId: doc._id,
        invitedBy: invitation.invitedBy,
        data: invitation.data,
        requestBody: req.body,
        requestHeaders: req.headers
      };
      res.json(payload);
      req.service.emit('invitation/accepted', payload);
    }
  );
}

function addGroupsToUser(req, res) {
  if (!req.user) {
    return helpers.unauthorized(res);
  }

  if (!req?.params?.groups) {
    return helpers.missingParameters(res, new Error('groups must be specified'));
  }

  const groups = getValidGroupsFromString(req.params.groups);

  if (!groups.length) {
    return helpers.badRequest(res, new Error('groups contain invalid object Id(s)'));
  }

  const update = { $addToSet: { groups: { $each: groups } } };

  req.db
    .collection(getUsersCollectionName())
    .findOneAndUpdate({ _id: req.user._id }, update, {
      returnDocument: 'after'
    })
    .then(result => res.json(result.value))
    .catch(error => helpers.error(res, error));
}

function extractUserPersonalData(req, res) {
  if (req.user && req.user?.isAdmin) {
    let userId;
    try {
      userId = new ObjectId(req.params.userId);
    } catch (e) {
      return redirectWithError(req, res, new Error('Erroneous userId'));
    }

    req.db.collection(getUsersCollectionName()).findOne(
      { _id: userId },
      {
        projection: {
          email: 1,
          displayname: 1,
          picture: 1,
          identities: {
            local: { id: 1, username: 1 },
            google: { id: 1, sub: 1, name: 1, given_name: 1, familly_name: 1, picture: 1, email: 1 },
            facebook: { id: 1, name: 1, email: 1 }
          }
        }
      },
      (_err, user) => {
        if (!user) return helpers.notFound(res);
        res.json(user);
      }
    );
  } else {
    return helpers.unauthorized(res, new Error('Only admin users can extract personal data for users'));
  }
}

module.exports = {
  initAuth,
  redirectWithError,
  callback,
  getProviders,
  getUsers,
  getAccessTokenForUser,
  me,
  updateMe,
  patchMe,
  createAnonymousUser,
  logout,
  inviteUser,
  acceptInvitation,
  addGroupsToUser,
  tokenMaintenance,
  extractUserPersonalData
};
