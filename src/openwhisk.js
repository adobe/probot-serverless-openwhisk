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

const { createProbot } = require('probot');
const { logger } = require('probot/lib/logger');
const { resolve } = require('probot/lib/resolver');
const { findPrivateKey } = require('probot/lib/private-key');
const defaultRoute = require('./views/default');

const ERROR = {
  statusCode: 500,
  body: 'Internal Server Error.',
};

function isFunction(obj) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
}

module.exports = class OpenWhiskWrapper {
  constructor() {
    this._handler = null;
    this._routes = {
      default: defaultRoute,
    };
    this._appId = null;
    this._secret = null;
    this._privateKey = null;
  }

  withHandler(handler) {
    if (typeof handler === 'string') {
      this._handler = resolve(handler);
    } else {
      this._handler = handler;
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
    };
    this._probot = createProbot(options);
    this._probot.load(app => this._handler(app, params));
  }

  create() {
    return async (params) => {
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

      logger.debug('intializing probot...');
      try {
        this.initProbot(params);
      } catch (e) {
        logger.error(`Error while loading probot: ${e.stack || e}`);
        return ERROR;
      }

      try {
        // gather the event data
        const name = headers['x-github-event'];
        const id = headers['x-github-delivery'];
        const payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));

        logger.info(`Received event ${id} ${name}${payload.action ? (`.${payload.action}`) : ''}`);

        // let probot handle the event
        await this._probot.receive({
          name,
          payload,
        });
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
  }
};
