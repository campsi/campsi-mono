const uuid = require('uuid');

function filterUserByEmailOrProviderId(provider, profile) {
  let query = { $or: [] };
  let identityIdFilter = {};
  identityIdFilter['identities.' + provider.name + '.id'] = profile.identity.id;
  query.$or.push(identityIdFilter);

  if (profile.email) {
    query.$or.push({ email: profile.email });
  }

  return query;
}

function genBearerToken(expiration) {
  let exp = new Date();
  exp.setTime(exp.getTime() + (expiration || 10) * 86400000);
  return {
    value: uuid(),
    expiration: exp,
  };
}

function genUpdate(provider, profile) {
  let update = { $set: {} };
  const token = genBearerToken(provider.expiration);
  update.$set.token = token.value;
  update.$set[`tokens.${token.value}`] = {
    expiration: token.expiration,
    grantedByProvider: provider.name,
  };
  update.$set[`identities.${provider.name}`] = profile.identity;
  update.$set.updatedAt = new Date();
  return { update, updateToken: token };
}

/**
 *
 * @param provider
 * @param profile
 * @return {{email: *|number|string|boolean, displayName, picture: *, identities: {}}}
 */
function genInsert(provider, profile) {
  const token = genBearerToken(provider.expiration);
  let insert = {
    email: profile.email,
    displayName: profile.displayName,
    picture: profile.picture,
    identities: {},
    createdAt: new Date(),
    groups: [],
  };
  insert.invitedBy = profile.invitedBy;
  insert.identities[provider.name] = profile.identity;
  insert.token = token.value;
  insert.tokens = {
    [token.value]: {
      expiration: token.expiration,
      grantedByProvider: provider.name,
    },
  };
  return { insert, insertToken: token };
}

module.exports = {
  filterUserByEmailOrProviderId: filterUserByEmailOrProviderId,
  genBearerToken: genBearerToken,
  genUpdate: genUpdate,
  genInsert: genInsert,
};
