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
process.env.LOG_LEVEL = 'debug';

const assert = require('assert');
const { OpenWhiskWrapper } = require('../index.js');

describe('OpenWhisk Wrapper - Defaults', () => {
  it('Delivers PING', async () => {
    // eslint-disable-next-line no-new
    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey('dummy')
      .create();

    const result = await main({
      __ow_method: 'get',
      __ow_path: '/ping',
    });

    delete result.headers.date;
    delete result.headers['x-request-id'];
    assert.deepEqual(result, {
      body: 'PONG',
      headers: {
        'cache-control': 'no-store, must-revalidate',
        connection: 'close',
        'content-length': '4',
        'x-powered-by': 'Express',
      },
      statusCode: 200,
    });
  });
});
