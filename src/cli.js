#!/usr/bin/env node
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

class ActionBuilder {
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
    this._externals = [
      /^probot(\/.*)?$/,
      'probot-commands',
      'dotenv',
    ];
    this._docker = 'tripodsan/probot-ow-nodejs8:latest';
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
    if (!this._wskNamespace) {
      this._wskNamespace = process.env.WSK_NAMESPACE;
    }
    if (!this._wskNamespace) {
      const wskProps = path.resolve(os.homedir(), '.wskprops');
      if (fs.existsSync(wskProps)) {
        const props = dotenv.parse(fs.readFileSync(wskProps));
        this._wskNamespace = props.NAMESPACE;
      }
    }
  }

  async createArchive() {
    return new Promise((resolve, reject) => {
      let hadErrors = false;

      // create zip file for package
      const output = fs.createWriteStream(this._zipFile);
      const archive = archiver('zip');

      console.log('Creating: ', path.relative(this._cwd, this._zipFile));
      output.on('close', () => {
        if (!hadErrors) {
          console.log(' %d total bytes', archive.pointer());
          resolve();
        }
      });
      archive.on('entry', (data) => {
        console.log(' - %s', data.name);
      });
      archive.on('warning', (err) => {
        console.log(`${chalk.redBright('[error] ')} ${err.message}`);
        hadErrors = true;
        reject(err);
      });
      archive.on('error', (err) => {
        console.log(`${chalk.redBright('[error] ')} ${err.message}`);
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
        console.log(stats.toString({
          chunks: false,
          colors: true,
        }));
        resolve();
      });
    });
  }

  async run() {
    this.validate();
    await this.createPackage();
    await this.createArchive();
    const relZip = path.relative(process.cwd(), this._zipFile);
    console.log(`\nCreated action: ${chalk.green(relZip)}.`);
    console.log('Deploy to openwhisk with:');
    console.log(chalk.grey(`$ wsk action update ${this._name} --docker ${this._docker} --web raw ${relZip}`));

    const nsp = this._wskNamespace || chalk.greenBright('$WSK_NAMESPACE');
    const webhook = `https://adobeioruntime.net/api/v1/web/${nsp}/default/${this._name}`;
    const homePage = `${webhook}/probot`;
    console.log('\nGithup App Settings:');
    console.log(`Homepage URL: ${chalk.green(homePage)}`);
    console.log(` Webhook URL: ${chalk.green(webhook)}`);
  }
}

new ActionBuilder()
  .run()
  .catch(console.error);
