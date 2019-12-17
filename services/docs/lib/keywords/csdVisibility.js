module.exports = function defFunc (ajv) {
  defFunc.definition = {
    compile: function (schema, parentSchema, it) {
      let strings = {};

      for (let key in schema) {
        const d = schema[key];
        const string = typeof d === 'string' ? d : undefined;
        strings[key] = string;
      }

      return it.opts.useVisibility && !it.compositeRule
        ? assign
        : noop;

      function assign (data) {
        for (let prop in schema) {
          if (strings[prop]) {
            data[prop] = strings[prop];
          } else {
            delete data[prop];
          }
        }
        return true;
      }

      function noop () { return true; }
    },
    metaSchema: {
      type: 'object',
      additionalProperties: {
        type: ['string', 'boolean']
      }
    }
  };

  ajv.addKeyword('csd-visibility', defFunc.definition);
  return ajv;
};
