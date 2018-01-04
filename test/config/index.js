const path = require('path');

const docsOptions = './index-docs.json';

module.exports = {
    port: 3000,
    host: 'http://localhost:3000',
    campsi: {
        title: 'Basic Test',
        version: '1.0.0',
        description: 'API de test manuel du service docs !',
        base_url: 'http://localhost:3000',
        mongo: {
            host: 'localhost',
            port: 27017,
            name: 'relatioships'
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
            title: 'Contenus',
            description: 'Data',
            namespace: 'test-docs',
            options: require(docsOptions),
            optionsBasePath: path.dirname(path.join(__dirname, docsOptions))
        },
    }
};
