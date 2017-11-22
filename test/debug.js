const local = require('../lib/local');

console.info(local.encryptPassword('toto', 'tata'));
console.info(local.createValidationToken('toto', 'tata'));