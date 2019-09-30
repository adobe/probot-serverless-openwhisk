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
const { createProbot } = require('probot');
const { logger } = require('probot/lib/logger');
const { logger: utilsLogger, expressify } = require('@adobe/openwhisk-action-utils');
const { rootLogger } = require('@adobe/helix-log');
const { resolve } = require('probot/lib/resolver');
const { findPrivateKey } = require('probot/lib/private-key');
const hbs = require('hbs');

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

  withApp(app) {
    if (typeof app === 'string') {
      this._apps.push(resolve(app));
    } else {
      this._apps.push(app);
    }
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
    return this.initProbot(params);
  }

  async initProbot(params) {
    const options = {
      id: this._appId,
      secret: this._secret,
      cert: this._privateKey,
      catchErrors: false,
      githubToken: this._githubToken,
      webhookPath: this._webhookPath,
    };
    const probot = createProbot(options);
    if (this._viewsDirectory.length === 0) {
      this.withViewsDirectory('./views');
    }
    probot.server.set('views', this._viewsDirectory);
    probot.logger.debug('Set view directory to %s', probot.server.get('views'));
    const hbsEngine = hbs.create();
    hbsEngine.localsAsTemplateData(probot.server);
    probot.server.engine('hbs', hbsEngine.__express);
    // load pkgJson as express local
    try {
      probot.server.locals.pkgJson = await fse.readJson(path.join(process.cwd(), 'package.json'));
    } catch (e) {
      probot.logger.info('unable to load package.json %s', e);
    }

    probot.load((app) => {
      this._apps.forEach((handler) => {
        handler(app, params, options);
      });
    });

    return probot;
  }

  create() {
    const run = async (params) => {
      const {
        __ow_method: method,
        __ow_headers: headers,
        __ow_body: body,
      } = params;

      // set APP_ID, WEBHOOK_SECRET and PRIVATE_KEY if defined via params
      if (!this._appId) {
        this._appId = params.GH_APP_ID;
      }
      if (!this._secret) {
        this._secret = params.GH_APP_WEBHOOK_SECRET;
      }
      if (!this._privateKey) {
        this._privateKey = params.GH_APP_PRIVATE_KEY || findPrivateKey();
      }

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
          logger.error(`Error validating payload: ${e.message}`);
          return ERROR;
        }
        logger.debug('payload signature valid.');
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
        logger.info(`Received event ${eventId} ${event}${payload.action ? (`.${payload.action}`) : ''}`);
      }

      let probot;
      try {
        logger.debug('intializing probot...');
        probot = await this.initProbot(params);
      } catch (e) {
        logger.error(`Error while loading probot: ${e.stack || e}`);
        return ERROR;
      }

      try {
        let result = {
          statusCode: 200,
          headers: {},
          body: 'ok\n',
        };

        if (delegateRequest) {
          result = await expressify(probot.server)(params);
        } else {
          // let probot handle the event
          await probot.receive({
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
        logger.error(err);
        return ERROR;
      }
    };

    return async (params) => {
      // make sure that the helix-logger doesn't also write to console
      rootLogger.loggers.delete('default');
      return utilsLogger.wrap(run, {
        __ow_logger: logger,
        ...params,
      });
    };
  }
};
