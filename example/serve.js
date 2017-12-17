// This is a demo file presenting the authentification service
const CampsiServer = require('campsi');
const Auth = require('../lib');

console.info(process.argv);
const port = '3010'; // process.argv
const host = 'localhost';
const config = {
    port: port,
    host: host,
    campsi: {
        title: 'Campsi Service Auth example server',
        base_url: 'http://' + host + ':' + port,
        mongoURI: 'mongodb://localhost:27017/campsi-service-auth-example',
    },
    services: {
        auth: {
            title: 'Authentification',
            kind: 'auth',
            options: {
                providers: {
                    local: require('../lib/providers/local')({
                        baseUrl: 'http://' + host + ':' + port + '/auth',
                        salt: 'CNDygyeFC6536964425994'
                    })
                }
            }
        }
    }
};

const campsi = new CampsiServer(config.campsi);
campsi.mount('auth', new Auth(config.services.auth));

campsi.on('campsi/ready', () => {
    campsi.listen(config.port);
    console.info('Campsi listening on port', config.port);
});

campsi.start().catch((err) => {
    debug('Error: %s', err);
});
