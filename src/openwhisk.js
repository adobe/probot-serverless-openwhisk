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

/* eslint-disable no-console,no-underscore-dangle */

const { createProbot } = require('probot');
const { resolve } = require('probot/lib/resolver');
const { findPrivateKey } = require('probot/lib/private-key');
const defaultRobotRoute = require('./views/default');

const ERROR = {
  statusCode: 500,
  body: 'Internal Server Error.',
};

module.exports = class OpenWhiskWrapper {
  constructor() {
    this._handler = null;
    this._routes = {
      '/robot': defaultRobotRoute,
    };
    this._appId = null;
    this._secret = null;
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

  initProbot() {
    const options = {
      id: this._appId,
      secret: this._secret,
      cert: findPrivateKey(),
    };
    this._probot = createProbot(options);
    this._probot.load(this._handler);
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
      if (method === 'get' && this._routes[path]) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/html',
          },
          body: this._routes[path],
        };
      }

      if (!body) {
        console.error('empty payload');
        return ERROR;
      }

      // set APP_ID and WEBHOOT_SECRET if defined via params
      if (params.GH_APP_ID) {
        this._appId = params.GH_APP_ID;
      }
      if (params.GH_WEBHOOK_SECRET) {
        this._secret = params.GH_WEBHOOK_SECRET;
      }

      // console.log('intializing probot...');
      try {
        this.initProbot();
      } catch (e) {
        console.error(`Error while loading probot: ${e.stack || e}`);
        return ERROR;
      }

      // console.log('intializing probot...done.');

      try {
        // gather the event data
        const name = headers['x-github-event'];
        const id = headers['x-github-delivery'];
        const payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));

        console.log(`Received event ${id} ${name}${payload.action ? (`.${payload.action}`) : ''}`);

        // let probot handle the event
        await this.probot.receive({
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
        console.error(err);
        return ERROR;
      }
    };
  }
};
