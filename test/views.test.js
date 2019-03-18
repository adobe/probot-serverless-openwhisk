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

/* eslint-env mocha */
/* eslint-disable global-require */
process.env.LOG_LEVEL = 'debug';

const assert = require('assert');
const path = require('path');
const { OpenWhiskWrapper, ViewsHelper } = require('../index.js');
const pkgJson = require('../package.json');

describe('OpenWhisk Wrapper - Defaults', () => {
  it('Delivers Hello world.', async () => {
    // eslint-disable-next-line no-new
    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey('dummy')
      .withViewsDirectory(path.resolve(__dirname, 'fixtures', 'views'))
      .withApp(new ViewsHelper()
        .withView('/hello_world', 'hello.hbs')
        .register())
      .create();

    const result = await main({
      __ow_method: 'get',
      __ow_path: '/hello_world',
    });

    delete result.headers.date;
    delete result.headers['x-request-id'];
    assert.deepEqual(result, {
      body: 'Hello, world.\n',
      headers: {
        'cache-control': 'no-store, must-revalidate',
        connection: 'close',
        'content-length': '14',
        'content-type': 'text/html; charset=utf-8',
        etag: 'W/"e-AbqYs8kBJvFFd9Wx/bH/6dM2RGk"',
        'x-powered-by': 'Express',
      },
      statusCode: 200,
    });
  });

  it('Can deliver static.', async () => {
    // eslint-disable-next-line no-new
    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey('dummy')
      .withApp(new ViewsHelper()
        .withStaticDir('/static', path.resolve(__dirname, 'fixtures', 'static'))
        .register())
      .create();

    const result = await main({
      __ow_method: 'get',
      __ow_path: '/static/hello.txt',
    });

    delete result.headers.date;
    delete result.headers.etag;
    delete result.headers['x-request-id'];
    delete result.headers['last-modified'];
    assert.deepEqual(result, {
      body: 'Hello, world.\n',
      headers: {
        'accept-ranges': 'bytes',
        'cache-control': 'public, max-age=0',
        connection: 'close',
        'content-length': '14',
        'content-type': 'text/plain; charset=UTF-8',
        'x-powered-by': 'Express',
      },
      statusCode: 200,
    });
  });

  it('Can set redirect.', async () => {
    // eslint-disable-next-line no-new
    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey('dummy')
      .withApp(new ViewsHelper()
        .withRedirect('/', '/wskbot')
        .register())
      .create();

    const result = await main({
      __ow_method: 'get',
      __ow_path: '/',
    });
    delete result.headers.date;
    delete result.headers['x-request-id'];
    assert.deepEqual(result, {
      body: 'Found. Redirecting to /wskbot',
      headers: {
        'cache-control': 'no-store, must-revalidate',
        connection: 'close',
        'content-length': '29',
        'content-type': 'text/plain; charset=utf-8',
        location: '/wskbot',
        vary: 'Accept',
        'x-powered-by': 'Express',
      },
      statusCode: 302,
    });
  });

  it('Can deliver default view', async () => {
    // eslint-disable-next-line no-new
    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey('dummy')
      .withApp(new ViewsHelper()
        .withView('/wskbot', 'wskbot.hbs')
        .register())
      .create();

    const result = await main({
      __ow_method: 'get',
      __ow_path: '/wskbot',
    });
    const match = `<h1>${pkgJson.name} v${pkgJson.version}</h1>`;
    assert.ok(result.body.indexOf(match) > 0);
  });
});
