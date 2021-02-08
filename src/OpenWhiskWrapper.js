/*
 * Copyright 2018 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-disable no-underscore-dangle */

const crypto = require('crypto');
const path = require('path');
const fse = require('fs-extra');
const { Probot, Server } = require('probot');
const pino = require('pino');
const { expressify, wrap } = require('@adobe/openwhisk-action-utils');
const { logger } = require('@adobe/openwhisk-action-logger');
const { getPrivateKey } = require('@probot/get-private-key');
const { resolveAppFunction } = require('probot/lib/helpers/resolve-app-function');
const hbs = require('hbs');
const PinoInterface = require('./pino-interface.js');

const ERROR = {
  statusCode: 500,
  headers: {
    'Cache-Control': 'no-store, private, must-revalidate',
  },
  body: 'Internal Server Error.',
};

/**
 * Validate if the payload is valid.
 * @param secret the webhook secret
 * @param payload the payload body
 * @param signature the signature of the POST
 * @throws Error if the payload is not valid.
 */
function validatePayload(secret, payload = '', signature) {
  if (!signature) {
    throw Error('signature required');
  }
  if (!secret) {
    throw Error('secret required');
  }
  const sig = signature.split('=');
  if (sig.length !== 2) {
    throw Error('invalid signature format.');
  }
  const signed = crypto.createHmac(sig[0], secret).update(payload, 'utf-8').digest();
  if (!crypto.timingSafeEqual(signed, Buffer.from(sig[1], 'hex'))) {
    throw Error('signature not valid.');
  }
}

module.exports = class OpenWhiskWrapper {
  constructor() {
    this._viewsDirectory = [];
    this._apps = [];
    this._appId = null;
    this._secret = null;
    this._privateKey = null;
    this._githubToken = null;
    this._webhookPath = '/';
  }

  async resolveApps() {
    return Promise.all(this._apps.map(async (app, idx, apps) => {
      if (typeof app === 'string') {
        // eslint-disable-next-line no-param-reassign
        apps[idx] = await resolveAppFunction(app);
      }
    }));
  }

  withApp(app) {
    this._apps.push(app);
    return this;
  }

  withViewsDirectory(value) {
    this._viewsDirectory.push(path.resolve(process.cwd(), value));
    return this;
  }

  withAppId(appId) {
    this._appId = appId;
    return this;
  }

  withWebhookSecret(secret) {
    this._secret = secret;
    return this;
  }

  withGithubPrivateKey(key) {
    this._privateKey = key;
    return this;
  }

  withGithubToken(token) {
    this._githubToken = token;
    return this;
  }

  withWebHookPath(value) {
    this._webhookPath = value;
    return this;
  }

  /**
   * Creates a probot server that is suitable for local development.
   * @param params - the 'action' params.
   * @returns {Probot} the probot (server).
   */
  async createProbotServer(params) {
    // add the fields that are usually set during run()
    this._appId = params.GH_APP_ID;
    this._secret = params.GH_APP_WEBHOOK_SECRET;
    this._privateKey = params.GH_APP_PRIVATE_KEY;
    await logger.init(params);
    return this.initProbot(params);
  }

  async initProbot(params) {
    const log = pino({
      level: process.env.LOG_LEVEL || 'info',
      name: 'probot',
      serializers: {
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: PinoInterface.resSerializer,
      },
    }, new PinoInterface());

    const options = {
      id: this._appId,
      secret: this._secret,
      privateKey: this._privateKey,
      catchErrors: false,
      githubToken: this._githubToken,
      log,
    };

    const server = new Server({
      log: options.log,
      webhookPath: this._webhookPath,
      // webhookProxy,
      Probot: Probot.defaults(options),
    });

    if (this._viewsDirectory.length === 0) {
      this.withViewsDirectory('./views');
    }

    server.expressApp.set('views', this._viewsDirectory);
    log.debug('Set view directory to %s', server.expressApp.get('views'));
    const hbsEngine = hbs.create();
    hbsEngine.localsAsTemplateData(server.expressApp);
    server.expressApp.engine('hbs', hbsEngine.__express);
    // load pkgJson as express local
    try {
      server.expressApp.locals.pkgJson = await fse.readJson(path.join(process.cwd(), 'package.json'));
    } catch (e) {
      log.info('unable to load package.json %s', e);
    }

    await server.load((app, opts) => {
      this._apps.forEach((handler) => {
        handler({ app, getRouter: opts.getRouter }, params, options);
      });
    });

    return server;
  }

  create() {
    const run = async (params) => {
      const {
        __ow_method: method,
        __ow_headers: headers,
        __ow_body: body,
        __ow_logger: log,
      } = params;

      // set APP_ID, WEBHOOK_SECRET and PRIVATE_KEY if defined via params
      if (!this._appId) {
        this._appId = params.GH_APP_ID;
      }
      if (!this._secret) {
        this._secret = params.GH_APP_WEBHOOK_SECRET;
      }
      if (!this._privateKey) {
        this._privateKey = params.GH_APP_PRIVATE_KEY || getPrivateKey();
      }

      await this.resolveApps();

      // check if the event is triggered via params.
      let { event, eventId, payload } = params;
      const { signature } = params;

      let delegateRequest = true;
      if (event && eventId && signature && payload) {
        // validate webhook
        try {
          validatePayload(this._secret, payload, signature);
          payload = JSON.parse(payload);
        } catch (e) {
          log.error(`Error validating payload: ${e.message}`);
          return ERROR;
        }
        log.debug('payload signature valid.');
        delegateRequest = false;
      } else if (method === 'post' && headers) {
        // eslint-disable-next-line no-param-reassign
        if (headers['content-type'] === 'application/json') {
          payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
        }
        event = headers['x-github-event'];
        eventId = headers['x-github-delivery'];
      }

      if (eventId && payload && payload.action) {
        log.info(`Received event ${eventId} ${event}${payload.action ? (`.${payload.action}`) : ''}`);
      }

      let probotServer;
      try {
        log.debug('intializing probot...');
        probotServer = await this.initProbot(params);
      } catch (e) {
        log.error(`Error while loading probot: ${e.stack || e}`);
        return ERROR;
      }

      try {
        let result = {
          statusCode: 200,
          headers: {},
          body: 'ok\n',
        };

        if (delegateRequest) {
          result = await expressify(probotServer.expressApp)(params);
        } else {
          // let probot handle the event
          await probotServer.probotApp.receive({
            name: event,
            payload,
          });
        }

        // set cache control header if not set
        if (!result.headers['cache-control']) {
          result.headers['cache-control'] = 'no-store, private, must-revalidate';
        }

        return result;
      } catch (err) {
        log.error(err);
        return ERROR;
      }
    };

    return wrap(run).with(logger);
  }
};
