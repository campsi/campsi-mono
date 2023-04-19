const $RefParser = require('json-schema-ref-parser');

// base validation schema, can be overriden in the service options
const defaultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: ['CREATED', 'DELETED', 'UPDATED', 'READ']
    },
    data: {
      type: 'object'
    },
    user: {
      type: 'string',
      pattern: '^[a-f\\d]{24}$'
    },
    date: {
      type: 'string',
      format: 'date-time'
    }
  },
  required: ['action', 'data', 'user', 'date']
};

module.exports.getCollectionName = function getCollectionName(options) {
  // if no collection name specified in the options file default to 'audit'
  return options?.collectionName ?? 'audit';
};

module.exports.validationSchema = async function validationSchema(service, resource) {
  if (!service || !resource) {
    return defaultSchema;
  }

  const schema = await $RefParser.dereference(service.config.optionsBasePath + '/', resource.schema, {});

  return schema;
};
