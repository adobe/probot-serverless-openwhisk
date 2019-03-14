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

/* eslint-disable no-console */

const OWCLI = require('@adobe/openwhisk-action-builder').CLI;

class CLI extends OWCLI {
  constructor() {
    super();
    this._yargs
      .default('kind', '')
      .default('web-export', true)
      .default('raw-http', true)
      // .default('docker', 'tripodsan/probot-ow-nodejs10:latest')
      .option('github-key', {
        description: 'Specify the GitHub private key file',
      })
      .group(['github-key'], 'GitHub Options');
  }

  // eslint-disable-next-line class-methods-use-this
  _epiloge() {
    return 'for more information, find our manual at https://github.com/tripodsan/probot-serverless-openwhisk';
  }

  // eslint-disable-next-line class-methods-use-this
  createBuilder() {
    // eslint-disable-next-line global-require
    const ActionBuilder = require('./action_builder.js');
    return new ActionBuilder();
  }

  prepare(args) {
    const builder = super.prepare(args);
    const argv = this._yargs.parse(args);
    return builder
      .withGithubPrivateKey(argv.githubKey);
  }
}

module.exports = CLI;
