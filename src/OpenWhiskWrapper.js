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
const { resolve } = require('probot/lib/resolver');
const { findPrivateKey } = require('probot/lib/private-key');
const delegator = require('expressjs-openwhisk');
const hbs = require('hbs');
const Logger = require('./Logger.js');

const ERROR = {
  statusCode: 500,
  headers: {
    'Cache-Control': 'no-store, must-revalidate',
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
    this._errors = [];
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

  async initProbot(params) {
    if (!this._privateKey) {
      this._privateKey = findPrivateKey();
    }
    const options = {
      id: this._appId,
      secret: this._secret,
      cert: this._privateKey,
      catchErrors: false,
      githubToken: this._githubToken,
      webhookPath: this._webhookPath,
    };
    this._probot = createProbot(options);
    if (this._viewsDirectory.length === 0) {
      this.withViewsDirectory('./views');
    }
    this._probot.server.set('views', this._viewsDirectory);
    this._probot.logger.debug('Set view directory to %s', this._probot.server.get('views'));
    const hbsEngine = hbs.create();
    hbsEngine.localsAsTemplateData(this._probot.server);
    this._probot.server.engine('hbs', hbsEngine.__express);

    // load pkgJson as express local
    try {
      const pkgJson = await fse.readJson(path.join(process.cwd(), 'package.json'));
      this._probot.server.locals.pkgJson = pkgJson;
    } catch (e) {
      this._probot.logger.info('unable to load package.json %s', e);
    }

    this._probot.load((app) => {
      const appOn = app.on;
      // the eventemmitter does not properly propagate errors thrown in the listeners
      // so we intercept the registration and wrap it with our own logic.
      // eslint-disable-next-line no-param-reassign
      app.on = (eventName, listener) => {
        const wrapper = async (...args) => {
          try {
            return await listener.apply(this._handler, args);
          } catch (e) {
            this._errors.push(e);
            throw e;
          }
        };
        return appOn.call(app, eventName, wrapper);
      };
      this._apps.forEach((handler) => {
        handler(app, params);
      });
    });
  }

  create() {
    const run = async (params) => {
      const {
        __ow_method: method,
        __ow_headers: headers,
        __ow_body: body,
      } = params;

      // set APP_ID and WEBHOOK_SECRET if defined via params
      if (!this._appId) {
        this._appId = params.GH_APP_ID || process.env.APP_ID;
      }
      if (!this._secret) {
        this._secret = params.GH_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
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
        // ensure payload is usable by probot
        payload = Buffer.from(body, 'base64').toString('utf8');
        payload = JSON.parse(payload);
        // eslint-disable-next-line no-param-reassign
        params.__ow_body = JSON.stringify(payload);
        event = headers['x-github-event'];
        eventId = headers['x-github-delivery'];
      }

      if (eventId && payload && payload.action) {
        logger.info(`Received event ${eventId} ${event}${payload.action ? (`.${payload.action}`) : ''}`);
      }

      try {
        logger.debug('intializing probot...');
        await this.initProbot(params);
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
          // delegate via express
          result = await delegator(this._probot.server)(params);
        } else {
          // let probot handle the event
          await this._probot.receive({
            name: event,
            payload,
          });
        }

        if (this._errors.length > 0) {
          return ERROR;
        }

        // set cache control header if not set
        if (!result.headers['cache-control']) {
          result.headers['cache-control'] = 'no-store, must-revalidate';
        }

        return result;
      } catch (err) {
        logger.error(err);
        return ERROR;
      }
    };

    return async (params) => {
      // setup logger if configured
      Logger.init(logger, params);

      // run actual action
      const result = await run(params);

      // if remote loggers are configured, wait a little to ensure logs buffers are flushed
      if (logger.flush) {
        logger.flush(); // don't wait for flush.
      }

      return result;
    };
  }
};
