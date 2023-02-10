const path = require('path');
const host = 'http://localhost:3000';
const LocalAssetStorage = require('../../services/assets/lib/storages/local');
const S3AssetStorage = require('../../services/assets/lib/storages/s3');

const docsOptions = '../docs/config/options/docs.js';

const storageProviders = {
  local: new LocalAssetStorage({
    name: 'local',
    title: 'Serveur',
    dataPath: path.join(__dirname, '..', 'data'),
    baseUrl: host + '/assets'
  }),
  s3: new S3AssetStorage({
    bucket: 'campsi-assets-test-bucket',
    dataPath: '/',
    getPublicAssetURL: data => {
      return `https://campsi-assets-test.imgix.net/${data.key}`;
    }
  })
};
module.exports = {
  // Application configuration
  port: 3000,
  campsi: {
    title: 'Test',
    publicURL: 'http://localhost:3000',
    mongo: {
      uri: 'mongodb://localhost:27017/test-campsi',
      database: 'test-campsi'
    },
    bodyParser: {
      json: {
        limit: '10mb'
      }
    }
  },
  campsiPrefix: {
    title: 'Test',
    publicURL: 'http://localhost:3000/v1',
    mongo: {
      uri: 'mongodb://localhost:27017/test-campsi',
      database: 'test-campsi'
    }
  },
  services: {
    test: {},
    trace: {
      title: 'Trace',
      options: {}
    },
    assets: {
      title: 'Médias',
      options: {
        allowPublicListing: true,
        roles: ['public', 'admin'],
        order: ['local', 's3'],
        fallback: 'local',
        // todo copy / backup
        getStorage: (file, user, headers) => storageProviders.s3,
        storages: storageProviders
      }
    },
    auth: {
      title: 'Authentification',
      options: {
        session: {
          secret: 'sqkerhgtkusyd'
        },
        providers: {
          local: require('../../services/auth/lib/providers/local')({
            baseUrl: host + '/auth',
            salt: 'CNDygyeFC6536964425994',
            resetPasswordTokenExpiration: 10
          }),
          github: require('../../services/auth/lib/providers/github')({
            baseUrl: host + '/auth',
            clientID: '96a51bcde35bc5f08f50',
            clientSecret: 'e492264cae11297e90ba0d20c25f13a95094111e'
          })
        }
      }
    },
    versioneddocs: {
      title: 'Versioned docs',
      description: 'Versioned docs db structure',
      options: {
        userService: server => {
          return server.services.get('auth');
        },
        usersFetcher: async (usersId, server) => {
          const users = await server.services.get('auth').fetchUsers(usersId.map(u => u.userId));
          return users.map(u => {
            return u._id
              ? {
                  displayName: u.displayName,
                  email: u.email,
                  data: u.data,
                  _id: u._id
                }
              : { _id: u };
          });
        },
        dbPrefix: 'versioned-docs',
        classes: {
          default: { permissions: { owner: '*', public: '*' } }
        },
        resources: {
          contracts: {
            label: 'versioned-contract',
            class: 'default',
            schema: require('../schemas/versioned-contract.schema'),
            rels: {
              project: {
                path: 'projectId',
                collection: 'docs.vault.projects',
                resource: 'projects',
                embed: false,
                fields: ['_id', 'name', 'websiteURL']
              }
            }
          }
        }
      },
      optionsBasePath: path.dirname(path.join(__dirname, '../'))
    },
    docs: {
      title: 'Contents',
      description: 'Tested Service',
      options: require(docsOptions),
      optionsBasePath: path.dirname(path.join(__dirname, docsOptions))
    },
    webhooks: {
      title: 'WebHooks',
      options: {
        channel: 'webhooks',
        requireAuth: true
      }
    },
    notifications: {
      title: 'Notifications',
      description: 'Notifications Center',
      options: {
        usersFetcher: () => {},
        roles: {},
        classes: {},
        resources: {
          notifications: {
            label: 'notifications',
            class: 'publicEntry',
            schema: require('../schemas/notification.schema')
          }
        }
      },
      optionsBasePath: path.dirname(path.join(__dirname, '../'))
    },
    audit: {
      title: 'Audit',
      description: 'Audit Service',
      options: {
        roles: {},
        classes: {},
        resources: {
          audit: {
            label: 'audit',
            class: 'publicEntry',
            schema: require('../schemas/log_entry.schema.json')
          }
        }
      },
      optionsBasePath: path.dirname(path.join(__dirname, '../'))
    },
    billing: {
      title: 'Contents',
      description: 'Billing Service',
      options: {
        secret_key: 'sk_test_TLvEhxPpHyrPhJeyMnJyM9jj',
        default_tax_percent: 20
      }
    }
  }
};
