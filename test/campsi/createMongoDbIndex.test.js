const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const { expect } = chai;
const { createMongoDbIndex } = require('../../lib/modules/mongoDbHelpers');

describe('createMongoDbIndex', function () {
  let collection;
  let logger;
  let indexDefinition;

  beforeEach(function () {
    collection = {
      createIndex: sinon.stub(),
      dropIndex: sinon.stub()
    };

    logger = {
      crit: sinon.stub()
    };

    indexDefinition = {
      indexSpecs: { field1: 1 },
      options: { unique: true }
    };
  });

  it('should create an index successfully', async function () {
    await createMongoDbIndex(collection, indexDefinition, logger, 'test');

    expect(collection.createIndex).to.have.been.calledWith(indexDefinition.indexSpecs, {
      ...indexDefinition.options,
      name: 'field1_1'
    });
  });

  it('should handle index creation errors', async function () {
    collection.createIndex.throws(new Error('Test error'));
    await createMongoDbIndex(collection, indexDefinition, logger, 'test');
    expect(logger.crit).to.have.been.called;
  });

  it('should retry on retryable error', async function () {
    collection.createIndex.onFirstCall().throws({ code: 85 });
    collection.createIndex.onSecondCall().resolves();

    await createMongoDbIndex(collection, indexDefinition, logger, 'test');

    expect(collection.createIndex).to.have.been.calledTwice;
  });

  it('should drop index on certain errors', async function () {
    collection.createIndex.onFirstCall().throws({ code: 85 });
    collection.createIndex.onSecondCall().resolves();

    await createMongoDbIndex(collection, indexDefinition, logger, 'test');

    expect(collection.dropIndex).to.have.been.called;
  });

  it('should handle error code 85 with specific message', async function () {
    collection.createIndex.onFirstCall().throws({ code: 85, message: 'Index already exists with a different name: test' });
    collection.createIndex.onSecondCall().resolves();

    await createMongoDbIndex(collection, indexDefinition, logger, 'test');

    expect(collection.dropIndex).to.have.been.calledWith('test');
  });

  it('should call logger.crit after too many retries', async function () {
    collection.createIndex.throws({ code: 85 });

    await createMongoDbIndex(collection, indexDefinition, logger, 'test');
    expect(collection.createIndex).to.have.been.callCount(4);

    expect(logger.crit).to.have.been.called;
  });
});
