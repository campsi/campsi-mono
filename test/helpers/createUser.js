module.exports = function createUser(chai, campsi, user) {
    return new Promise(resolve => {
        chai.request(campsi.app)
            .post('/auth/local/signup')
            .set('content-type', 'application/json')
            .send(user)
            .end((err, res) => {
                resolve(res.body.token);
            });
    });
};
