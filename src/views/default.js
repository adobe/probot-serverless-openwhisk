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

// eslint-disable-next-line import/no-dynamic-require
const { name, version } = require(`${process.cwd()}/package.json`);

module.exports = `
<!DOCTYPE html>
<html lang="en" class="height-full">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>${name} | built with Probot</title>
    <link rel="stylesheet" href="https://probot.github.io/assets/css/index.css?d=1521919566">
  </head>
  <body class="height-full bg-gray-light">
    <div class="d-flex flex-column flex-justify-center flex-items-center text-center height-full">
      <img src="https://probot.github.io/assets/logo.png" alt="Probot Logo" width="100" class="mb-6">
      <div class="box-shadow rounded-2 border p-6 bg-white">
        <h1>
          Welcome to ${name}!
          <span class="Label Label--outline v-align-middle ml-2 text-gray-light">v${version}</span>
        </h1>
        <p>This bot was built using <a href="https://github.com/probot/probot">Probot</a>, a framework for building GitHub Apps.</p>
      </div>

      <div class="mt-4">
        <h4 class="alt-h4 text-gray-light">Need help?</h4>
        <div class="d-flex flex-justify-center mt-2">
          <a href="https://probot.github.io/docs/" class="btn btn-outline mr-2">Documentation</a>
          <a href="https://probot-slackin.herokuapp.com/" class="btn btn-outline">Chat on Slack</a>
        </div>
      </div>
    </div>
  </body>
</html>
`;
