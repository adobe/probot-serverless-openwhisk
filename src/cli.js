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

const path = require('path');
const archiver = require('archiver');
const webpack = require('webpack');
const { findPrivateKey } = require('probot/lib/private-key');

async function createPackage(script) {
  return new Promise((resolve, reject) => {
    const baseName = path.basename(script, '.js');
    const name = this._prefix + baseName;
    const zipFile = path.resolve(this._target, `${name}.zip`);
    let hadErrors = false;

    // create zip file for package
    const output = fs.createWriteStream(zipFile);
    const archive = archiver('zip');

    console.log('⏳  preparing package %s: ', zipFile);
    output.on('close', () => {
      if (!hadErrors) {
        console.log('    %d total bytes', archive.pointer());
        resolve({
          name,
          path: zipFile,
        });
      }
    });
    archive.on('entry', (data) => {
      console.log('    - %s', data.name);
    });
    archive.on('warning', (err) => {
      console.log(`${chalk.redBright('[error] ')}File ${script} could not be read. ${err.message}`);
      hadErrors = true;
      reject(err);
    });
    archive.on('error', (err) => {
      console.log(`${chalk.redBright('[error] ')}File ${script} could not be read. ${err.message}`);
      hadErrors = true;
      reject(err);
    });

    const packageJson = {
      name,
      version: '1.0',
      description: `Lambda function of ${name}`,
      main: 'main.js',
      license: 'Apache-2.0',
    };

    archive.pipe(output);
    archive.file(script, { name: 'main.js' });
    if (this._staticContent === 'bundled' && baseName === 'html') {
      archive.directory(this._distDir, 'dist');
      archive.file(path.resolve(__dirname, 'openwhisk/server.js'), { name: 'server.js' });
      archive.file(path.resolve(this._target, 'manifest.json'), { name: 'manifest.json' });
      packageJson.main = 'server.js';
    }

    archive.append(JSON.stringify(packageJson, null, '  '), { name: 'package.json' });
    archive.finalize();
  });
}

async function package(entry) {
  const compiler = webpack({
    target: 'node',
    mode: 'development',
    entry,
    output: {
      path: process.cwd(),
      filename: 'dist/main.js',
      library: 'template',
      libraryTarget: 'umd',
    },
    devtool: false,
    externals: [
      'probot',
      'probot-servleless-openwhisk',
    ],
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

async function run() {
  const privKey = findPrivateKey();
  if (!privKey) {
    throw new Error('Unable to find a private key in your directory.');
  }
  console.log(typeof privKey);
  await package(process.argv[2] || './index.js');
}

run().catch(console.error);
