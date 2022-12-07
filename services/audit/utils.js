// base validation schema, can be overriden in the service options
const defaultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: ['CREATE', 'DELETE', 'UPDATE', 'READ']
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

module.exports.validationSchema = function validationSchema(options) {
  return options?.schema ?? defaultSchema;
};
