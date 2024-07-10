// reference: https://www.mongodb.com/docs/manual/reference/error-codes/
const INDEX_RELATED_ERRORS = [
  { code: 67, codeName: 'CannotCreateIndex', retryWithDrop: false },
  { code: 68, codeName: 'IndexAlreadyExists', retryWithDrop: false },
  { code: 85, codeName: 'IndexOptionsConflict', retryWithDrop: true },
  { code: 86, codeName: 'IndexKeySpecsConflict', retryWithDrop: true },
  { code: 171, codeName: 'CannotIndexParallelArrays', retryWithDrop: false },
  { code: 181, codeName: 'AmbiguousIndexKeyPattern', retryWithDrop: false },
  { code: 197, codeName: 'InvalidIndexSpecificationOption', retryWithDrop: false },
  { code: 201, codeName: 'CannotBuildIndexKeys', retryWithDrop: false },
  { code: 221, codeName: 'IndexModified', retryWithDrop: true },
  { code: 276, codeName: 'IndexBuildAborted', retryWithDrop: true },
  { code: 285, codeName: 'IndexBuildAlreadyInProgress', retryWithDrop: false }
];

/**
 * Create a mongodb index, with error handling and retry logic (up to 3 times)
 * @param {import('mongodb').Collection} collection
 * @param {Object} indexDefinition
 * @param {Object} indexDefinition.indexSpecs
 * @param {Object} [indexDefinition.options = {}]
 * @param {import('pino').Logger} logger
 * @param {string} environment
 * @param {number} [retries = 0]
 * @returns {Promise<void>}
 */
const createMongoDbIndex = async (collection, indexDefinition, logger, environment, retries = 0) => {
  const { indexSpecs, options = {} } = indexDefinition;
  // reference: https://www.mongodb.com/docs/manual/indexes/#index-names
  const indexName =
    options.name ||
    Object.entries(indexSpecs)
      .map(([key, value]) => `${key}_${value}`)
      .join('_');

  try {
    await collection.createIndex(indexSpecs, { ...options, name: indexName });
  } catch (err) {
    const knownError = INDEX_RELATED_ERRORS.find(e => e.code === err.code);
    if (!knownError || !knownError.retryWithDrop || retries >= 3) {
      return logger.crit(
        { err, indexDefinition, collectionName: collection.collectionName, environment },
        `[mongodb] [createMongoDbIndex] Error creating mongodb index : ${err.message}`
      );
    }

    let indexNameToDrop = indexName;
    if (knownError.code === 85 && err.message?.startsWith('Index already exists with a different name: ')) {
      indexNameToDrop = err.message.split(': ')[1];
    }

    await collection.dropIndex(indexNameToDrop);
    return createMongoDbIndex(collection, indexDefinition, logger, environment, retries + 1);
  }
};

module.exports = { createMongoDbIndex };
