const CampsiService = require('campsi/lib/service');
const handlers = require('./handlers');

module.exports = class TraceService extends CampsiService {
    initialize() {
        const service = this;

        this.router.use('/', (req, res, next) => {
            req.service = service;
            next();
        });
        this.router.all('*', handlers.traceRequest);
        return new Promise((resolve) => { resolve(); });
    }

    describe() {
        let desc = super.describe();
        return desc;
    }
};
