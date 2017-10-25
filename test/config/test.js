const path = require('path');

const docsOptions = './docs.json';

module.exports = {
    port: 3000,
    host: 'http://localhost:3000',
    campsi: {
        title: 'Test Arezzo',
        version: '1.0.0',
        description: 'API de test avec les pizzas Arezzo !',
        base_url: 'http://localhost:3000',
        mongoURI: 'mongodb://localhost:27017/relationships',
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
            description: 'Données sur les pizzas',
            namespace: 'test-docs',
            options: require(docsOptions),
            optionsBasePath: path.dirname(path.join(__dirname, docsOptions))
        },
    }
};
