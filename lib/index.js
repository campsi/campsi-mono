const CampsiService = require('campsi/lib/service');
const handlers = require('./handlers');

module.exports = class TraceService extends CampsiService {
    initialize() {
        const options = this.options;

        this.router.use('/', (req, res, next) => {
            req.options = options;
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
