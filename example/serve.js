// This is a demo file presenting the authentification service
const CampsiServer = require('campsi');
const Auth = require('../lib');
const debug = require('debug')('example');
debug(process.argv);
const port = '3010'; // process.argv
const host = 'localhost';
const config = {
    port: port,
    host: host,
    campsi: {
        title: 'Campsi Service Auth example server',
        base_url: 'http://' + host + ':' + port,
        mongo: {
            host: 'localhost',
            port: 27017,
            database: 'campsi-service-auth-example'
        },

    },
    services: {
        auth: {
            title: 'Authentification',
            kind: 'auth',
            options: {
                session: {
                    secret: 'sqkerhgtkusyd'
                },
                providers: {
                    local: require('../lib/providers/local')({
                        baseUrl: 'http://' + host + ':' + port + '/auth',
                        salt: 'CNDygyeFC6536964425994',
                        resetPasswordTokenExpiration: 10
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
    debug('Campsi listening on port', config.port);
});

campsi.on('auth/local/passwordResetTokenCreated', user => {
    debug('passwordResetTokenCreated', user.identities.local.passwordResetToken);
});

campsi.start().catch((err) => {
    debug('Error: %s', err);
});
