const findCallback = require('./modules/findCallback');
const builder = require('./modules/queryBuilder');
const uuid = require('uuid');

function genBearerToken(provider) {
    let exp = new Date();
    exp.setTime(exp.getTime() + (provider.expiration || 10 ) * 86400000);
    return {
        value: uuid(),
        expiration: exp
    };
}

function genUpdate(provider, profile) {
    let update = {$set: {}};
    update.$set.token = genBearerToken(provider);
    update.$set['identities.' + provider.name] = profile.identity;
    return update;
}

/**
 * Intercepts passport callback
 * @param fn
 * @param args
 * @param done
 */
function proxyVerifyCallback(fn, args, done) {
    const {callback, index} = findCallback(args);
    args[index] = function (err, user) {
        done(err, user, callback);
    };
    fn.apply(null, args);
}

function genInsert(provider, profile, update) {
    let insert = {
        email: profile.email,
        displayName: profile.displayName,
        picture: profile.picture,
        identities: {}
    };

    insert.identities[provider.name] = profile.identity;
    insert.token = update.$set.token;

    return insert;
}

module.exports = function passportMiddleware(req) {
    const users = req.db.collection('__users__');
    const provider = req.authProvider;
    proxyVerifyCallback(provider.callback, arguments, function (err, profile, passportCallback) {
        if (!profile || err) {
            return passportCallback('cannot find user');
        }
        let filter = builder.filterUserByEmailOrProviderId(provider, profile);
        let update = genUpdate(provider, profile);
        users.findOneAndUpdate(filter, update, {returnOriginal: false})
            .then((result) => {
                if (result.value) {
                    return passportCallback(null, result.value);
                }

                let insert = genInsert(provider, profile, update);
                return users.insertOne(insert).then((insertResult) => passportCallback(null, insertResult.ops[0]));
            }).catch(passportCallback);
    });
};
