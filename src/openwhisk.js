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
const { createProbot } = require('probot');
const { logger } = require('probot/lib/logger');
const { resolve } = require('probot/lib/resolver');
const { findPrivateKey } = require('probot/lib/private-key');
const Bunyan2Loggly = require('bunyan-loggly');
const defaultRoute = require('./views/default');

const ERROR = {
  statusCode: 500,
  body: 'Internal Server Error.',
};

function isFunction(obj) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
}

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
    this._handlers = null;
    this._routes = {
      default: defaultRoute,
    };
    this._appId = null;
    this._secret = null;
    this._privateKey = null;
    this._errors = [];
  }

  withHandler(handler) {
    if (!this._handlers) {
      this._handlers = [];
    }
    if (typeof handler === 'string') {
      this._handlers.push(resolve(handler));
    } else {
      this._handlers.push(handler);
    }
    return this;
  }

  withRoute(name, template) {
    this._routes[name] = template;
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

  initProbot(params) {
    if (!this._privateKey) {
      this._privateKey = findPrivateKey();
    }
    const options = {
      id: this._appId,
      secret: this._secret,
      cert: this._privateKey,
      catchErrors: false,
    };
    this._probot = createProbot(options);
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
      this._handlers.forEach((handler) => {
        handler(app, params);
      });
    });
  }

  create() {
    const run = async (params) => {
      const {
        __ow_method: method,
        __ow_headers: headers,
        __ow_path: path,
        __ow_body: body,
      } = params;

      // check for the routes
      if (method === 'get' && !body) {
        let route = 'default';
        if (this._routes[path]) {
          route = path;
        }
        logger.info('Serving: %s', route);

        let view = this._routes[route];
        if (isFunction(view)) {
          view = view();
        }
        if (view.then) {
          view = await view;
        }
        if (typeof view === 'string') {
          view = {
            statusCode: 200,
            headers: {
              'Content-Type': 'text/html',
            },
            body: view,
          };
        }
        return view;
      }

      // set APP_ID and WEBHOOK_SECRET if defined via params
      if (!this._appId) {
        this._appId = params.GH_APP_ID || process.env.APP_ID;
      }
      if (!this._secret) {
        this._secret = params.GH_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
      }

      // gather the event data either from params or request
      let {
        event, eventId, signature, payload,
      } = params;
      if (method === 'post' && headers) {
        payload = Buffer.from(body, 'base64').toString('utf8');
        event = headers['x-github-event'];
        eventId = headers['x-github-delivery'];
        signature = headers['x-hub-signature'];
      }
      if (!payload || !event) {
        logger.error('no event information.');
        return ERROR;
      }

      // validate webhook
      try {
        validatePayload(this._secret, payload, signature);
        payload = JSON.parse(payload);
      } catch (e) {
        logger.error(`Error validating payload: ${e.message}`);
        return ERROR;
      }
      logger.debug('payload signature valid.');

      logger.debug('intializing probot...');
      try {
        this.initProbot(params);
      } catch (e) {
        logger.error(`Error while loading probot: ${e.stack || e}`);
        return ERROR;
      }

      try {
        logger.info(`Received event ${eventId} ${event}${payload.action ? (`.${payload.action}`) : ''}`);

        // let probot handle the event
        await this._probot.receive({
          name: event,
          payload,
        });
        if (this._errors.length > 0) {
          return ERROR;
        }
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'ok',
          }),
        };
      } catch (err) {
        logger.error(err);
        return ERROR;
      }
    };

    return async (params) => {
      // setup loggly logger if configured
      logger.fields.ow = {
        activationId: process.env.__OW_ACTIVATION_ID,
        actionName: process.env.__OW_ACTION_NAME,
      };
      const hasLoggly = params && params.LOGGLY_SUBDOMAIN && params.LOGGLY_TOKEN;

      if (hasLoggly) {
        // temporary fix to avoid cumulation of streams in case the nodejs process isn't stopped
        // in between activations
        if (logger.streams.find(s => s.name === 'LogglyStream')) {
          // eslint-disable-next-line no-console
          console.log('(loggly stream already added)');
        } else {
          const logglyConfig = {
            token: params.LOGGLY_TOKEN,
            subdomain: params.LOGGLY_SUBDOMAIN,
          };
          const bufferLength = 1000;
          const bufferTimeout = 500;
          logger.addStream({
            name: 'LogglyStream',
            level: 'debug',
            type: 'raw',
            stream: new Bunyan2Loggly(logglyConfig, bufferLength, bufferTimeout),
          });

          logger.flush = async function flush() {
            return new Promise((done) => {
              setTimeout(() => {
                done();
              }, 5000);
            });
          };
        }
      } else {
        logger.info('unable to setup loggly logger. credentials missing.');
      }

      // run actual action
      const result = await run(params);
      // if loggly is configured, wait a little to ensure logs buffers are flushed
      if (hasLoggly) {
        await logger.flush();
      }

      return result;
    };
  }
};
