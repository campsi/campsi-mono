const { randomUUID: uuid } = require('crypto');

function filterUserByEmailOrProviderId(provider, profile) {
  const query = { $or: [] };
  const identityIdFilter = {};
  identityIdFilter['identities.' + provider.name + '.id'] = profile.identity.id;
  query.$or.push(identityIdFilter);

  if (profile.email) {
    query.$or.push({ email: profile.email });
  }

  return query;
}

function genBearerToken(expiration) {
  const exp = new Date();
  exp.setTime(exp.getTime() + (expiration || 10) * 86400000);
  return {
    value: uuid(),
    expiration: exp
  };
}

function genUpdate(provider, profile) {
  const update = { $set: {} };
  const token = genBearerToken(provider.expiration);
  update.$set[`tokens.${token.value}`] = {
    expiration: token.expiration,
    grantedByProvider: provider.name
  };
  update.$set[`identities.${provider.name}`] = profile.identity;
  update.$set.updatedAt = new Date();
  return { update, updateToken: token };
}

function extractCountry(country) {
  return country.split('-').length > 1 ? country.split('-')[1].toUpperCase() : country.toUpperCase();
}

/**
 *
 * @param provider
 * @param profile
 * @return {{email: *|number|string|boolean, displayName, picture: *, identities: {}}}
 */
function genInsert(provider, profile) {
  const token = genBearerToken(provider.expiration);
  const insert = {
    email: profile.email.toLowerCase(),
    displayName: profile.displayName,
    picture: profile.picture,
    data: { country: profile.country ? extractCountry(profile.country) : null },
    identities: {},
    createdAt: new Date(),
    groups: []
  };
  insert.invitedBy = profile.identity.invitedBy;
  insert.identities[provider.name] = profile.identity;
  insert.tokens = {
    [token.value]: {
      expiration: token.expiration,
      grantedByProvider: provider.name
    }
  };
  return { insert, insertToken: token };
}

module.exports = {
  filterUserByEmailOrProviderId,
  genBearerToken,
  genUpdate,
  genInsert
};
