const path = require('path');

const docsOptions = './options/docs.json';

module.exports = {
    port: 3000,
    host: 'http://localhost:3000',
    campsi: {
        title: 'Test - Campsi Service Docs',
        version: '1.0.0',
        description: 'Test - Campsi Service Docs',
        base_url: 'http://localhost:3000',
        mongo: {
            host: 'localhost',
            port: 27017,
            database: 'relationships'
        },
        license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/mit-license.php'
        },
        contact: {
            name: 'Christophe Braud',
            email: 'christophe@agilitation.fr',
            url: 'http://agilitation.fr'
        }
    },
    services: {
        docs: {
            title: 'Contents',
            description: 'Tested Service',
            namespace: 'test-docs',
            options: require(docsOptions),
            optionsBasePath: path.dirname(path.join(__dirname, docsOptions))
        },
    }
};
