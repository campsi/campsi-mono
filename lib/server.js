const CampsiService = require('./service');
const debug = require('debug')('campsi');
const MQTTEmitter = require('mqtt-emitter');
const express = require('express');
const async = require('async');
const { MongoClient } = require('mongodb');
const { URL } = require('url');
const { ValidationError } = require('express-json-validator-middleware');
const pinoHttp = require('pino-http');
const crypto = require('crypto');

// middlewares
const cors = require('cors');
const bodyParser = require('body-parser');

function ServiceException(path, service, message) {
  this.name = 'Service exception';
  this.message = message;
  this.path = path;
  this.service = service;
}

const pinoHttpDefaultOptions = {
  level: 'silent',
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  genReqId() {
    return crypto.randomUUID();
  }
};

/**
 * @property {Db} db
 */
class CampsiServer extends MQTTEmitter {
  constructor(config) {
    super();
    this.app = express();
    this.config = config;
    this.pinoHttp = pinoHttp(Object.assign(pinoHttpDefaultOptions, this.config.pino));
    this.logger = this.pinoHttp.logger;
    this.url = new URL(this.config.publicURL);
    this.services = new Map();
  }

  listen() {
    return this.app.listen(...arguments);
  }

  mount(path, service) {
    if (!/^[a-z]*$/.test(path)) {
      throw new ServiceException(path, service, 'Path is malformed');
    }
    if (!(service instanceof CampsiService)) {
      throw new ServiceException(path, service, 'Service is not a CampsiService');
    }
    if (this.services.has(path)) {
      throw new ServiceException(path, service, 'Path already exists');
    }
    this.services.set(path, service);
  }

  start() {
    return this.dbConnect()
      .then(() => this.setupApp())
      .then(() => this.loadServices())
      .then(() => this.describe())
      .then(() => this.finalizeSetup());
  }

  dbConnect() {
    const campsiServer = this;
    return new Promise((resolve, reject) => {
      const mongoUri = campsiServer.config.mongo.uri;
      MongoClient.connect(mongoUri, (err, client) => {
        if (err) return reject(err);
        campsiServer.dbClient = client;
        campsiServer.db = client.db(campsiServer.config.mongo.database);
        resolve();
      });
    });
  }

  setupApp() {
    this.app.use(cors());
    const bodyParserOptions = this.config.bodyParser || {
      json: {},
      text: {},
      urlencoded: {
        extended: false
      }
    };
    this.app.use(bodyParser.json(bodyParserOptions.json));
    this.app.use(bodyParser.text(bodyParserOptions.text));
    this.app.use(bodyParser.urlencoded(bodyParserOptions.urlencoded));
    this.app.use((req, res, next) => {
      req.campsi = this;
      req.db = this.db;
      req.config = this.config;
      next();
    });
    this.app.use((req, res, next) => {
      res.header('X-powered-by', 'campsi');
      next();
    });
    for (const service of this.services.values()) {
      const middlewares = service.getMiddlewares();
      for (const middleware of middlewares) {
        this.app.use(middleware(this, service));
      }
    }
    // Middlewares that augment the req object must be added before the pino middleware.
    this.app.use(this.pinoHttp);
  }

  loadServices() {
    return new Promise(resolve => {
      async.eachOf(
        this.services,
        (value, key, cb) => {
          const path = value[0];
          const service = value[1];
          service.server = this;
          service.db = this.db;
          service.path = path;
          service
            .initialize()
            .then(() => {
              const serviceFullPath = this.url.pathname === '/' ? '/' + path : this.url.pathname + '/' + path;
              this.app.use(serviceFullPath, service.router);
              cb();
            })
            .catch(err => {
              debug('Loading services error: %s', err.message);
            });
        },
        resolve
      );
    });
  }

  describe() {
    this.app.get(this.url.pathname, (req, res) => {
      const result = {
        title: this.config.title,
        services: {}
      };
      this.services.forEach((service, path) => {
        result.services[path] = service.describe();
      });
      res.json(result);
    });
  }

  finalizeSetup() {
    this.app.use((req, res, next) => {
      res.status(404).json({ message: `Can't find ${req.method} ${req.path}` });
    });

    this.app.use((err, req, res, next) => {
      if (res.headersSent) {
        return next(err);
      }

      // An error may happen in a middleware registred before the pino middleware.
      if (req.log) {
        req.log.error(err, err.message);
      } else {
        this.logger.error(err, err.message);
      }

      if (err instanceof ValidationError) {
        return res.status(400).send(err.validationErrors);
      }

      const { message, status } = err;
      res.status(status || 500).json({
        message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
      });
    });
    this.emit('campsi/ready');
  }
}

module.exports = CampsiServer;
