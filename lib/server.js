const CampsiService = require('./service');
const debug = require('debug')('campsi');
const MQTTEmitter = require('mqtt-emitter');
const express = require('express');
require('async');
require('express-async-errors');
const { MongoClient } = require('mongodb');
const Redis = require('ioredis');
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

const pinoHttpDefaultOptions = config => {
  return {
    level: 'silent',
    formatters: {
      level(label) {
        return { level: label, environment: config.environment };
      }
    },
    genReqId() {
      return crypto.randomUUID();
    }
  };
};

/**
 * @property {Db} db
 */
class CampsiServer extends MQTTEmitter {
  constructor(config) {
    super();
    this.app = express();
    this.config = config;
    this.pinoHttp = pinoHttp(Object.assign(pinoHttpDefaultOptions(this.config), this.config.pino));
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

  async start() {
    await this.dbConnect();
    await this.redisConnect();
    this.setupApp();
    await this.loadServices();
    this.describe();
    this.finalizeSetup();
  }

  async dbConnect() {
    const campsiServer = this;
    const client = await MongoClient.connect(campsiServer.config.mongo.uri);
    campsiServer.dbClient = client;
    campsiServer.db = client.db(campsiServer.config.mongo.database);
  }

  async redisConnect() {
    const campsiServer = this;
    campsiServer.redis = new Redis(campsiServer.config.redis);
    await new Promise((resolve, reject) => {
      campsiServer.redis.ping((err, res) => {
        if (err || !res) {
          reject(err);
        } else {
          debug('Redis connected.');
          resolve();
        }
      });
    });
  }

  setupApp() {
    this.app.use(cors());
    const bodyParserOptions = this.config.bodyParser || {
      json: {},
      text: {},
      urlencoded: {
        extended: true
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

  async loadServices() {
    for (const [path, service] of [...this.services.entries()]) {
      service.server = this;
      service.db = this.db;
      service.path = path;
      try {
        debug(`Initializing service ${path}...`);
        await service.initialize();

        const serviceFullPath = this.url.pathname === '/' ? `/${path}` : `${this.url.pathname}/${path}`;
        this.app.use(serviceFullPath, service.router);
        debug(`service ${path} initialized`);
      } catch (err) {
        debug('Loading services error: %s', err.message);
        throw err;
      }
    }
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
    if (this.config.errorHandler) {
      this.app.use(this.config.errorHandler(this));
    } else {
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
    }
    this.emit('campsi/ready');
  }
}

module.exports = CampsiServer;
