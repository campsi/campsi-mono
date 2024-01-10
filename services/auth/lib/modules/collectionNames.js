/**
 * return the session collection
 * @param {import('../../../../lib/server')} campsi
 * @param {string} [servicePath]
 * @returns {Promise<import('mongodb').Collection>}
 */
async function getSessionCollection(campsi, servicePath) {
  return getAuthCollection(campsi, servicePath, 'Session');
}

/**
 * return the users collection
 * @param {import('../../../../lib/server')} campsi
 * @param {string} [servicePath]
 * @returns {Promise<import('mongodb').Collection>}
 */
async function getUsersCollection(campsi, servicePath) {
  return getAuthCollection(campsi, servicePath, 'Users');
}

/**
 * return the users or sessions collection
 * @param {import('../../../../lib/server')} campsi
 * @param {string} [servicePath]
 * @param {('Users'|'Session')} [collectionType]
 * @returns {Promise<import('mongodb').Collection>}
 */
async function getAuthCollection(campsi, servicePath, collectionType) {
  if (!['Users', 'Session'].includes(collectionType)) {
    throw new Error('Invalid collectionType');
  }
  let collectionName;
  let authPath;

  if (servicePath) {
    const service = campsi.services.get(servicePath);
    if (service) {
      const className = service.constructor.name;
      if (className === 'AuthService') {
        collectionName = service[`get${collectionType}CollectionName`]();
      }
      authPath = service.options.authServicePath;
    }
  }

  if (!collectionName && !authPath) {
    const authServices = [...campsi.services.values()].filter(s => s.constructor.name === 'AuthService');
    if (authServices.length > 1) {
      throw new Error('Multiple AuthServices found');
    }
    authPath = authServices[0]?.path;
    if (!authPath) {
      throw new Error('No AuthService found');
    }
    collectionName = campsi.services.get(authPath)[`get${collectionType}CollectionName`]();
  }

  const collectionExists = !!(await campsi.db.listCollections({ name: collectionName }, { nameOnly: true }).toArray()).length;

  if (!collectionExists) {
    throw new Error(`Collection ${collectionName} not found`);
  }
  return campsi.db.collection(collectionName);
}

module.exports = {
  getSessionCollection,
  getUsersCollection
};
