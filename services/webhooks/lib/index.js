/* eslint-disable space-before-function-paren */
const CampsiService = require('../../../lib/service');
const { ObjectId } = require('mongodb');
const debug = require('debug')('campsi:service-webhooks');
const async = require('async');
const request = require('request');

class WebhooksService extends CampsiService {
  initialize() {
    return new Promise(resolve => {
      this.options = Object.assign(WebhooksService.defaults, this.options);
      this.collection = this.db.collection(`webhooks.${this.path}`);
      this.router.use((req, res, next) => {
        if (!req.user) {
          res.status(403).json({ message: 'webhooks require a valid auth token' });
        }
        req.service = this;
        next();
      });
      this.router.get('/', this.getWebhooks.bind(this));
      this.router.post('/', this.createWebhook.bind(this));
      this.router.delete('/:id', this.deleteWebhook.bind(this));
      this.server.on(`${this.options.channel || 'webhooks'}/#`, this.handleEvent.bind(this));
      debug(`service initialized, listening to channel "${this.options.channel}"`);
      this.collection.createIndex({ uri: 1, event: 1 }, { unique: true }, resolve);
    });
  }

  handleEvent(payload, params, event) {
    this.collection
      .find({
        event,
        failCount: {
          $lt: 10
        }
      })
      .toArray()
      .then(webhooks => {
        async.each(
          webhooks,
          (webhook, cb) => {
            const options = {
              method: webhook.method,
              headers: webhook.headers || {},
              body: payload,
              json: true
            };
            request(webhook.uri, options, (err, res, body) => {
              if (err || String(res.statusCode)[0] !== '2') {
                this.collection
                  .findOneAndUpdate({ _id: webhook._id }, { $inc: { failCount: 1 } }, { returnDocument: 'after' })
                  .then(result => {
                    debug(`failed ${result.value._id}, ${result.value.failCount} failure so far`);
                  })
                  .catch(updateError => {
                    debug('error updating webhook', updateError);
                  });
              } else {
                debug(`Received HTTP response:\n> status: ${res.statusCode}\n> body: ${JSON.stringify(body)}`);
              }
              cb();
            });
          },
          () => {
            debug('all done');
          }
        );
      })
      .catch(error => {
        debug(error);
      });
  }

  getWebhooks(req, res) {
    this.collection
      .find(this.options.requireAuth ? { createdBy: new ObjectId(req.user._id) } : {})
      .toArray()
      .then(webhooks => {
        res.json({ webhooks });
      })
      .catch(error => {
        res.status(500).json({ error });
      });
  }

  createWebhook(req, res) {
    const doc = {
      createdAt: new Date(),
      uri: req.body.uri,
      method: req.body.method || 'POST',
      headers: req.body.headers || {},
      event: req.body.event,
      failCount: 0
    };
    if (this.options.requireAuth) {
      doc.createdBy = new ObjectId(req.user._id);
    }
    this.collection
      .insertOne(doc)
      .then(result => {
        res.status(201).json({ _id: result.insertedId, ...doc });
      })
      .catch(error => {
        res.status(500).json({ error });
      });
  }

  deleteWebhook(req, res) {
    const filter = {
      _id: ObjectId(req.params.id)
    };
    if (this.options.requireAuth) {
      filter.createdBy = new ObjectId(req.user._id);
    }
    this.collection
      .deleteOne(filter)
      .then(result => {
        res.status(200).json(result);
      })
      .catch(error => {
        res.status(500).json({ error });
      });
  }
}

WebhooksService.defaults = {
  requireAuth: true,
  channel: 'webhooks'
};
module.exports = WebhooksService;
