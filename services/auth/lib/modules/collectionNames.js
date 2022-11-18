/* eslint-disable no-process-exit */
/* eslint-disable node/no-unpublished-require */
const config = require('config');

function getUsersCollectionName() {
  return config?.services?.auth?.options?.collectionName || '__users__';
}

function getSessionCollectionName() {
  return config?.services?.auth?.options?.session?.collectionName || '__sessions__';
}

module.exports = {
  getUsersCollectionName,
  getSessionCollectionName
};
