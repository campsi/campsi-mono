const config = require('config');
const CampsiServer = require('campsi');
const builder = require('../lib/modules/queryBuilder');

let campsi = new CampsiServer(config.campsi);

campsi.dbConnect().then(() => {
  const collectionName = config.services['auth'].options.collectionName || '__users__';
  const collection = campsi.db.collection(collectionName);
  const email = process.argv[2] || 'admin@campsi.io';
  let {insert, insertToken} = builder.genInsert({
    name: 'admin',
    expiration: 1000
  }, {
    email: email,
    displayName: email,
    identity: {}
  });
  insert.roles = ['admin'];
  collection.insertOne(insert).then(res => {
    process.stdout.write('\nAdmin user created\n');
    process.stdout.write(`  -> token : ${insertToken.value}\n`);
    process.exit();
  }).catch(err => {
    process.stderr.write('\nCould not create the admin user\n');
    process.stderr.write('  -> ' + err.message);
    process.stderr.write('\n');
    process.exit();
  });
});
