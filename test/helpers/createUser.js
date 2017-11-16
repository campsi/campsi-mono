const CryptoJS = require('crypto-js');
const uuid = require('uuid');

module.exports.createUser = function(campsi, data, connect) {
    connect = typeof connect  !== 'undefined' ? connect : false;
    return new Promise(function (resolve, reject) {
        const localProvider = campsi.services.get('auth').options.providers.local;
        const encryptedPassword = CryptoJS.AES.encrypt(
            data.password,
            localProvider.options.salt
        ).toString();

        let user = {
            displayName: data.displayName,
            email: data.email || data.username,
            identities: {
                local: {
                    id: data.username,
                    username: data.username,
                    password: encryptedPassword
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
                    resolve(token.value);
                } else {
                    resolve(result.insertedId);
                }
            }).catch((err) => reject(err));
    });
};
