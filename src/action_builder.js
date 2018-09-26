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

const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const webpack = require('webpack');
const chalk = require('chalk');
const { findPrivateKey } = require('probot/lib/private-key');
const dotenv = require('dotenv');
const os = require('os');
const ow = require('openwhisk');
const request = require('request-promise-native');

// poor men's logging...
let verbose = false;
const log = {
  debug: (...args) => { if (verbose) { console.log(...args); } },
  info: console.log,
  warn: console.warn,
  error: console.error,
};

module.exports = class ActionBuilder {
  constructor() {
    this._cwd = process.cwd();
    this._distDir = null;
    this._name = null;
    this._file = null;
    this._zipFile = null;
    this._privateKey = null;
    this._bundle = null;
    this._env = null;
    this._wskNamespace = null;
    this._wskAuth = null;
    this._wskApiHost = null;
    this._verbose = false;
    this._externals = [
      /^probot(\/.*)?$/,
      'probot-commands',
      'fs-extra',
      'js-yaml',
      'openpgp',
      'dotenv',
    ];
    this._docker = 'tripodsan/probot-ow-nodejs8:latest';
    this._deploy = false;
    this._test = false;
    this._showHints = false;
    this._statics = new Map();
  }

  verbose(enable) {
    this._verbose = enable;
    verbose = this._verbose;
    return this;
  }

  withDeploy(enable) {
    this._deploy = enable;
    return this;
  }

  withTest(enable) {
    this._test = enable;
    return this;
  }

  withHints(showHints) {
    this._showHints = showHints;
    return this;
  }

  withStatic(srcPath, dstRelPath) {
    if (!srcPath) {
      return this;
    }

    if (Array.isArray(srcPath)) {
      srcPath.forEach((v) => {
        this._statics.set(v, v);
      });
    } else {
      this._statics.set(srcPath, dstRelPath);
    }
    return this;
  }

  validate() {
    if (!this._privateKey) {
      this._privateKey = findPrivateKey();
    }
    if (!this._privateKey) {
      throw new Error('No Probot-App private key set nor cannot be found in your directory.');
    }

    if (!this._file) {
      this._file = path.resolve(this._cwd, 'index.js');
    }
    if (!this._env) {
      this._env = path.resolve(this._cwd, '.env');
    }
    if (!this._distDir) {
      this._distDir = path.resolve(this._cwd, 'dist');
    }
    if (!this._name) {
      this._name = path.basename(this._cwd);
    }
    if (!this._zipFile) {
      this._zipFile = path.resolve(this._distDir, `${this._name}.zip`);
    }
    if (!this._bundle) {
      this._bundle = path.resolve(this._distDir, `${this._name}-bundle.js`);
    }

    // init openwhisk props
    const wskPropsFile = path.resolve(os.homedir(), '.wskprops');
    let wskProps = {};
    if (fs.existsSync(wskPropsFile)) {
      wskProps = dotenv.parse(fs.readFileSync(wskPropsFile));
    }
    this._wskNamespace = this._wskNamespace || wskProps.NAMESPACE || process.env.WSK_NAMESPACE;
    this._wskAuth = this._wskAuth || wskProps.AUTH || process.env.WSK_AUTH;
    this._wskApiHost = this._wskApiHost || wskProps.APIHOST || process.env.WSK_APIHOST || 'https://adobeioruntime.net';
  }

  async createArchive() {
    return new Promise((resolve, reject) => {
      let hadErrors = false;

      // create zip file for package
      const output = fs.createWriteStream(this._zipFile);
      const archive = archiver('zip');

      log.debug('Creating: ', path.relative(this._cwd, this._zipFile));
      output.on('close', () => {
        if (!hadErrors) {
          log.debug(' %d total bytes', archive.pointer());
          resolve();
        }
      });
      archive.on('entry', (data) => {
        log.debug(' - %s', data.name);
      });
      archive.on('warning', (err) => {
        log.warn(`${chalk.redBright('[error] ')} ${err.message}`);
        hadErrors = true;
        reject(err);
      });
      archive.on('error', (err) => {
        log.error(`${chalk.redBright('[error] ')} ${err.message}`);
        hadErrors = true;
        reject(err);
      });

      const packageJson = {
        name: this._name,
        version: '1.0',
        description: `OpenWhisk Action of ${this._name}`,
        main: 'main.js',
        license: 'Apache-2.0',
      };

      archive.pipe(output);
      archive.file(this._bundle, { name: 'app.js' });
      archive.file(path.resolve(__dirname, 'main.js'), { name: 'main.js' });
      if (typeof this._privateKey === 'string') {
        archive.file(this._privateKey, { name: 'private-key.pem' });
      } else {
        archive.append(this._privateKey, { name: 'private-key.pem' });
      }
      if (fs.existsSync(this._env)) {
        archive.file(this._env, { name: '.env' });
      }
      this._statics.forEach((src, name) => {
        archive.file(src, { name });
      });

      archive.append(JSON.stringify(packageJson, null, '  '), { name: 'package.json' });
      archive.finalize();
    });
  }

  async createPackage() {
    const compiler = webpack({
      target: 'node',
      mode: 'development',
      entry: this._file,
      output: {
        path: this._cwd,
        filename: path.relative(this._cwd, this._bundle),
        library: 'template',
        libraryTarget: 'umd',
      },
      devtool: false,
      externals: this._externals,
    });

    return new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err) {
          reject(err);
          return;
        }
        log.debug(stats.toString({
          chunks: false,
          colors: true,
        }));
        resolve();
      });
    });
  }

  async deploy() {
    const openwhisk = ow({
      apihost: this._wskApiHost,
      api_key: this._wskAuth,
      namespace: this._wskNamespace,
    });


    const relZip = path.relative(process.cwd(), this._zipFile);
    log.debug(`Deploying ${relZip} as ${this._name} to OpenWhisk`);
    const actionoptions = {
      name: this._name,
      action: fs.readFileSync(this._zipFile),
      kind: 'blackbox',
      exec: {
        image: this._docker,
      },
      annotations: {
        'web-export': true,
        'raw-http': true,
      },
    };
    const result = await openwhisk.actions.update(actionoptions);
    log.info(`${chalk.green('ok:')} updated action ${chalk.whiteBright(`${result.namespace}/${result.name}`)}`);
    if (this._showHints) {
      log.info('\nYou can verify the action with:');
      log.info(chalk.grey(`$ curl "${this._wskApiHost}/api/v1/web/${this._wskNamespace}/default/${result.name}"`));
    }
  }

  async test() {
    const url = `${this._wskApiHost}/api/v1/web/${this._wskNamespace}/default/${this._name}`;
    log.info(`--: requesting: ${chalk.blueBright(url)} ...`);
    try {
      const ret = await request(url);
      log.info(`${chalk.green('ok:')} 200`);
      log.debug(chalk.grey(ret));
    } catch (e) {
      log.error(`${chalk.red('error: ')} ${e.message}`);
    }
  }

  async run() {
    this.validate();
    await this.createPackage();
    await this.createArchive();
    const relZip = path.relative(process.cwd(), this._zipFile);
    log.info(`${chalk.green('ok:')} created action: ${chalk.whiteBright(relZip)}.`);
    if (this._deploy) {
      await this.deploy();
    } else if (this._showHints) {
      log.info('Deploy to openwhisk the following command or specify --deploy on the commandline:');
      log.info(chalk.grey(`$ wsk action update ${this._name} --docker ${this._docker} --web raw ${relZip}`));
    }

    if (this._test) {
      await this.test();
    }

    if (this._showHints) {
      const nsp = this._wskNamespace || chalk.greenBright('$WSK_NAMESPACE');
      const webhook = `https://adobeioruntime.net/api/v1/web/${nsp}/default/${this._name}`;
      const homePage = `${webhook}/probot`;
      log.info('\nGithup App Settings:');
      log.info(`Homepage URL: ${chalk.blueBright(homePage)}`);
      log.info(` Webhook URL: ${chalk.blueBright(webhook)}`);
    }
  }
};
