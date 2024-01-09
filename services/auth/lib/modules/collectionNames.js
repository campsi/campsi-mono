/* eslint-disable no-process-exit */
/* eslint-disable node/no-unpublished-require */
const config = require('config');

function getSessionCollectionName() {
  return config?.services?.auth?.options?.session?.collectionName || '__sessions__';
}

/**
 * return the users collection
 * @param {import('../../../../lib/server')} campsi
 * @param {string} [servicePath]
 * @returns {Promise<import('mongodb').Collection>}
 */
async function getUsersCollection(campsi, servicePath) {
  let collectionName;
  let authPath;

  if (servicePath) {
    const service = campsi.services.get(servicePath);
    if (service) {
      const className = service.constructor.name;
      if (className === 'AuthService') {
        collectionName = service.getUsersCollectionName();
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
    collectionName = campsi.services.get(authPath).getUsersCollectionName();
  }

  const collectionExists = !!(await campsi.db.listCollections({ name: collectionName }, { nameOnly: true }).toArray()).length;

  if (!collectionExists) {
    throw new Error(`Collection ${collectionName} not found`);
  }
  return campsi.db.collection(collectionName);
}

module.exports = {
  getSessionCollectionName,
  getUsersCollection
};
