module.exports = function defFunc(ajv) {
  defFunc.definition = {
    compile: function(schema, parentSchema, it) {
      const strings = {};

      for (const key in schema) {
        const d = schema[key];
        const string = typeof d === 'string' ? d : undefined;
        strings[key] = string;
      }

      return it.opts.useVisibility && !it.compositeRule ? assign : noop;

      function assign(data) {
        for (const prop in schema) {
          if (strings[prop]) {
            data[prop] = strings[prop];
          } else {
            delete data[prop];
          }
        }
        return true;
      }

      function noop() {
        return true;
      }
    },
    keyword: 'csd-visibility',
    metaSchema: {
      type: 'object',
      additionalProperties: {
        type: ['string', 'boolean']
      }
    }
  };

  ajv.addKeyword(defFunc.definition);
  return ajv;
};
