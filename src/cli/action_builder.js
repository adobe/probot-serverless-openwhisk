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

const fse = require('fs-extra');
const OWActionBuilder = require('@adobe/openwhisk-action-builder').ActionBuilder;
const chalk = require('chalk');
const { findPrivateKey } = require('probot/lib/private-key');
const dotenv = require('dotenv');
const pkgConfig = require('./packager-config.js');
const { version } = require('../../package.json');

const GITHUB_PRIVATE_KEY_FILE = 'github-private-key.pem';

module.exports = class ActionBuilder extends OWActionBuilder {
  constructor() {
    super();
    this._privateKey = null;
    this._verbose = true;
  }

  withGithubPrivateKey(key) {
    this._privateKey = key;
    return this;
  }

  async validate() {
    await super.validate();
    if (!this._privateKey) {
      this._privateKey = findPrivateKey();
    }
    if (!this._privateKey) {
      throw new Error('No Probot-App private key set nor cannot be found in your directory.');
    }

    this._externals = pkgConfig.externals;
    this._kind = 'nodejs:10';
  }

  async updateArchive(archive, packageJson) {
    await super.updateArchive(archive, packageJson);

    // add the private key
    if (typeof this._privateKey === 'string') {
      archive.file(this._privateKey, { name: GITHUB_PRIVATE_KEY_FILE });
    } else {
      archive.append(this._privateKey, { name: GITHUB_PRIVATE_KEY_FILE });
    }

    // process and generate the .env file
    let env = {};
    if (await fse.pathExists(this._env)) {
      env = dotenv.parse(await fse.readFile(this._env));
      delete env.PRIVATE_KEY;
    }
    env.PRIVATE_KEY_PATH = GITHUB_PRIVATE_KEY_FILE;
    archive.append(ActionBuilder.toEnv(env), { name: '.env' });
  }

  async run() {
    this.log.info(chalk`{grey wskbot v${version}}`);
    await super.run();

    if (this._showHints) {
      const nsp = this._wskNamespace || chalk.greenBright('$WSK_NAMESPACE');
      const webhook = `https://adobeioruntime.net/api/v1/web/${nsp}/${this._actionName}`;
      const homePage = `${webhook}/probot`;
      this.log.info('\nGithup App Settings:');
      this.log.info(`Homepage URL: ${chalk.blueBright(homePage)}`);
      this.log.info(` Webhook URL: ${chalk.blueBright(webhook)}`);
    }
  }
};
