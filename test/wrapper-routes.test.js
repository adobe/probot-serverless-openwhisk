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

/* eslint-env mocha */
/* eslint-disable global-require */

const assert = require('assert');
const { OpenWhiskWrapper } = require('../index.js');

describe('OpenWhisk Wrapper - Routes', () => {
  it('Can deliver static template', async () => {
    // eslint-disable-next-line no-new
    const main = new OpenWhiskWrapper()
      .withRoute('/static.txt', require('./fixtures/template-string.js'))
      .withGithubPrivateKey('dummy')
      .withHandler({})
      .create();

    const result = await main({
      __ow_method: 'get',
      __ow_path: '/static.txt',
    });

    assert.deepEqual(result, {
      body: 'Hello, world.',
      headers: {
        'Content-Type': 'text/html',
      },
      statusCode: 200,
    });
  });

  it('Can deliver async function template', async () => {
    // eslint-disable-next-line no-new
    const main = new OpenWhiskWrapper()
      .withRoute('/static.txt', require('./fixtures/template-async-func.js'))
      .withGithubPrivateKey('dummy')
      .withHandler({})
      .create();

    const result = await main({
      __ow_method: 'get',
      __ow_path: '/static.txt',
    });

    assert.deepEqual(result, {
      body: 'Hello, world.',
      headers: {
        'Content-Type': 'text/plain',
      },
      statusCode: 200,
    });
  });

  it('Can deliver static function template', async () => {
    // eslint-disable-next-line no-new
    const main = new OpenWhiskWrapper()
      .withRoute('/static.txt', require('./fixtures/template-static-func.js'))
      .withGithubPrivateKey('dummy')
      .withHandler({})
      .create();

    const result = await main({
      __ow_method: 'get',
      __ow_path: '/static.txt',
    });

    assert.deepEqual(result, {
      body: 'Hello, world.',
      headers: {
        'Content-Type': 'text/plain',
      },
      statusCode: 200,
    });
  });

  it('Can deliver default view', async () => {
    // eslint-disable-next-line no-new
    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey('dummy')
      .withHandler({})
      .create();

    const result = await main({
      __ow_method: 'get',
      __ow_path: '/whatever',
    });

    assert.ok(/.*probot-serverless-openwhisk.*/.test(result.body));
  });

  it('Can overwrite default view', async () => {
    // eslint-disable-next-line no-new
    const main = new OpenWhiskWrapper()
      .withRoute('default', require('./fixtures/template-string.js'))
      .withGithubPrivateKey('dummy')
      .withHandler({})
      .create();

    const result = await main({
      __ow_method: 'get',
      __ow_path: '/',
    });

    assert.deepEqual(result, {
      body: 'Hello, world.',
      headers: {
        'Content-Type': 'text/html',
      },
      statusCode: 200,
    });
  });
});
