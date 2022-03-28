const { Validator } = require('express-json-validator-middleware');

const validator = new Validator();

module.exports = validator.validate;
