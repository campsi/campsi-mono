const uuid = require('uuid');
const local = require('../../lib/local');

/**
 * 
 * @param {CampsiServer} campsi 
 * @param {object} data 
 * @param {boolean} connect
 * @returns {Promise}
 */
module.exports.createUser = function(campsi, data, connect) {
    connect = typeof connect  !== 'undefined' ? connect : false;
    return new Promise(function (resolve, reject) {
        const localProvider = campsi.services.get('auth').options.providers.local;
        const encryptedPassword = local.encryptPassword(data.password, localProvider.options.salt);
        const validationToken = local.createValidationToken(data.username, localProvider.options.salt);

        let user = {
            displayName: data.displayName,
            email: data.email || data.username,
            identities: {
                local: {
                    id: data.username,
                    username: data.username,
                    password: encryptedPassword,
                    validationToken: validationToken,
                    validated: data.validated || false
                }
            }
        };

        let exp = new Date();
        exp.setTime(exp.getTime() + 10 * 86400000);
        let token = {
            value: uuid(),
            expiration: exp
        };
        if(connect) {
            user.token = token;
        }

        campsi.db.collection('__users__').insertOne(user)
            .then((result) => {
                if(connect) {
                    resolve(token.value, result.insertedId, validationToken);
                } else {
                    resolve(result.insertedId, validationToken);
                }
            }).catch((err) => reject(err));
    });
};
