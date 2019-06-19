/*
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-disable no-console */

const dotenv = require('dotenv');
const fse = require('fs-extra');
const path = require('path');
const { ActionBuilder } = require('@adobe/openwhisk-action-builder');

class DevelopmentServer {
  /**
   * Creates a new probot development server using the given OpenWhiskWrapper.
   * @param {OpenWhiskWrapper} wrapper - The wrapper used to create the github action.
   */
  constructor(wrapper) {
    this._wrapper = wrapper;
    this._cwd = process.cwd();
  }

  /**
   * Initializes this server by creating the probot instance and configure it accordingly.
   * It uses the `wsk.package.params-file` and `wsk.params-file` to read the environment for
   * the action params.
   *
   * @returns this
   */
  async init() {
    // load the action params params
    let pkgJson = {};
    try {
      pkgJson = await fse.readJson(path.resolve(this._cwd, 'package.json'));
    } catch (e) {
      // ignore
    }
    const builder = new ActionBuilder();
    if (pkgJson.wsk && pkgJson.wsk['params-file']) {
      builder.withParamsFile(pkgJson.wsk['params-file']);
    }
    if (pkgJson.wsk && pkgJson.wsk.package && pkgJson.wsk.package['params-file']) {
      builder.withParamsFile(pkgJson.wsk.package['params-file']);
    }

    // eslint-disable-next-line no-underscore-dangle
    const params = await ActionBuilder.resolveParams(builder._params);

    // create the probot server
    this._probot = await this._wrapper.createProbotServer(params);

    // read local development config
    let config = {};
    try {
      config = dotenv.parse(await fse.readFile(path.resolve(this._cwd, '.env')));
    } catch (e) {
      console.warn('Note: you can add environment variables to a local .env file.');
    }

    this._probot.options.port = config.PROBOT_SERVER_PORT || 4000;
    if (config.WEBHOOK_PROXY_URL) {
      this._probot.options.webhookProxy = config.WEBHOOK_PROXY_URL;
    } else {
      console.warn('Note: Starting Probot server locally without reverse proxy.');
      console.warn('  For a better developer experience, open a new channel in https://smee.io');
      console.warn('  And set the WEBHOOK_PROXY_URL in the .env file.\n');
    }
    return this;
  }

  async run() {
    await this._probot.start();
  }
}

module.exports = DevelopmentServer;
