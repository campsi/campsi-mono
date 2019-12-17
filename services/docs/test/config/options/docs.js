module.exports = {
  usersFetcher: (users, server) => new Promise((resolve, reject) => {
    resolve(users.map(user => Object.assign({}, user, {displayName: `External user ${user.userId}`})));
  }),
  roles: {
    admin: {
      label: 'Administrateur',
      auth: true,
      admin: true
    },
    public: {
      label: 'Public',
      auth: false
    },
    publisher: {
      label: 'Publisher',
      auth: true
    },
    basic: {
      label: 'Basic User',
      auth: true
    }
  },
  classes: {
    collection: {
      defaultState: 'published',
      states: {
        published: {
          name: 'published',
          label: 'En ligne',
          validate: true
        },
        working_draft: {
          name: 'working_draft',
          label: 'Brouillon',
          validate: false
        },
        archived: {
          name: 'archived',
          label: 'Archivés',
          validate: false
        },
        private: {
          name: 'private',
          label: 'Privé',
          validate: false
        }
      },
      permissions: {
        publisher: {
          published: '*',
          working_draft: '*',
          archived: '*'
        },
        owner: {
          published: '*',
          working_draft: '*',
          archived: '*'
        },
        public: {
          published: 'GET, PUT',
          working_draft: '*'
        }
      }
    },
    document: {
      defaultState: 'draft',
      single: true,
      states: {
        published: {
          name: 'published',
          label: 'En ligne',
          validate: true
        },
        draft: {
          name: 'draft',
          label: 'Brouillon',
          validate: false
        }
      },
      permissions: {
        admin: {
          published: 'GET,PUT',
          draft: 'GET,PUT'
        },
        public: {
          published: 'GET'
        }
      }
    },
    form: {
      defaultState: 'submitted',
      states: {
        submitted: {
          name: 'submitted',
          label: 'Reçu',
          validate: true
        },
        read: {
          name: 'read',
          label: 'Lu',
          validate: false
        },
        replied: {
          name: 'replied',
          label: 'Répondu',
          validate: false
        },
        archived: {
          name: 'archived',
          label: 'Archivé',
          validate: false
        }
      },
      permissions: {
        admin: {
          read: '*',
          replied: '*',
          submitted: '*',
          archived: '*'
        },
        public: {
          submitted: 'POST'
        }
      }
    },
    'test-class': {
      defaultState: 'state-public',
      states: {
        'state-public': {
          name: 'public',
          label: 'Public',
          validate: false
        },
        'state-basic': {
          name: 'basic',
          label: 'Basic',
          validate: false
        },
        'state-private': {
          name: 'private',
          label: 'Private',
          validate: false
        }
      },
      permissions: {
        admin: {
          'state-public': '*',
          'state-basic': '*',
          'state-private': '*'
        },
        basic: {
          'state-basic': '*'
        },
        owner: {
          'state-private': '*',
          'state-public': '*',
          'state-basic': '*'
        },
        public: {
          'state-public': '*'
        }
      }
    }
  },
  resources: {
    pizzas: {
      label: 'La carte des pizzas',
      class: 'collection',
      schema: {'$ref': '../schema/pizza.schema.json'}
    },
    contact: {
      label: 'Formulaire de contact du site web',
      class: 'form',
      schema: {'$ref': '../schema/contact.schema.json'}
    },
    opening_hours: {
      label: 'Jours et horaires de contact',
      class: 'document',
      schema: {'$ref': '../schema/opening_hours.schema.json'}
    },
    categories: {
      label: 'Categories',
      class: 'collection',
      webhooks: [
        {
          on: 'POST,PUT,DELETE',
          states: [
            'published'
          ],
          uri: 'http://127.0.0.1:3001',
          method: 'POST',
          payload: true,
          retry: 5,
          timeout: 20,
          headers: {
            Authorization: 'Basic YWRtaW5AY2FtcHNpLmlvOnBhc3N3b3Jk'
          }
        }
      ],
      schema: {'$ref': '../schema/category.schema.json'}
    },
    articles: {
      label: 'Articles',
      class: 'collection',
      rels: {
        parent_category: {
          path: 'rels.oneToOneRelationship',
          resource: 'categories',
          embed: true,
          fields: [
            'label'
          ]
        },
        other_categories: {
          path: 'rels.oneToManyRelationship.*',
          resource: 'categories',
          embed: false
        }
      },
      schema: {'$ref': '../schema/article.schema.json'}
    },
    simple: {
      label: 'A Simple Document',
      class: 'test-class',
      schema: {'$ref': '../schema/document.schema.json'}
    }
  }
};
