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
/* eslint-disable global-require,no-underscore-dangle */

const crypto = require('crypto');
const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');
const { OpenWhiskWrapper } = require('../index.js');

const PRIVATE_KEY_PATH = path.resolve(__dirname, 'fixtures', 'test-private-key-pem.txt');
const PAYLOAD_ISSUES_OPENED = path.resolve(__dirname, 'fixtures', 'issues.opened.json');
const WEBHOOK_SECRET = 'mysecret';

class TestHandler {
  invoker() {
    return this.handle.bind(this);
  }

  handle(app, actionParams = {}) {
    this.testParam = actionParams.TEST_PARAM || '';
    app.on('issues.opened', async () => {
      this.invoked = true;
    });
  }
}

async function createTestPayload(testContext, rootPath = '/') {
  let payload = await fs.readFile(PAYLOAD_ISSUES_OPENED, 'utf-8');
  payload = JSON.stringify(JSON.parse(payload));
  const signature = crypto.createHmac('sha1', WEBHOOK_SECRET).update(payload, 'utf-8').digest('hex');
  return {
    __ow_method: 'post',
    __ow_path: rootPath,
    __ow_body: Buffer.from(payload).toString('base64'),
    __ow_headers: {
      'x-github-event': 'issues.opened',
      'x-github-delivery': 1234,
      'x-hub-signature': `sha1=${signature}`,
    },
    TEST_PARAM: 'test-param',
    testContext,
  };
}

async function createRawTestPayload(testContext) {
  const payload = await fs.readFile(PAYLOAD_ISSUES_OPENED, 'utf-8');
  const signature = `sha1=${crypto.createHmac('sha1', WEBHOOK_SECRET).update(payload, 'utf-8').digest('hex')}`;
  return {
    event: 'issues.opened',
    eventId: 1234,
    payload,
    signature,
    TEST_PARAM: 'test-param',
    testContext,
  };
}

describe('OpenWhisk Wrapper - Handler', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = process.env;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('invokes the handler', async () => {
    const testHandler = new TestHandler();

    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withWebhookSecret(WEBHOOK_SECRET)
      .withHandler(testHandler.invoker())
      .withGithubToken('dummy')
      .create();

    const result = await main(await createTestPayload());

    assert.ok(testHandler.invoked);
    assert.equal(testHandler.testParam, 'test-param');
    delete result.headers.date;
    assert.deepEqual(result, {
      body: 'ok\n',
      statusCode: 200,
      headers: {
        'cache-control': 'no-store, must-revalidate',
        connection: 'close',
        'content-length': '3',
        'x-powered-by': 'Express',
        'x-request-id': '1234',
      },
    });
  });

  it('invokes the handler on different webhook root', async () => {
    const testHandler = new TestHandler();

    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withWebhookSecret(WEBHOOK_SECRET)
      .withHandler(testHandler.invoker())
      .withGithubToken('dummy')
      .withWebHookPath('/somepath')
      .create();

    const result = await main(await createTestPayload({}, '/somepath'));

    assert.ok(testHandler.invoked);
    assert.equal(testHandler.testParam, 'test-param');
    delete result.headers.date;
    assert.deepEqual(result, {
      body: 'ok\n',
      statusCode: 200,
      headers: {
        'cache-control': 'no-store, must-revalidate',
        connection: 'close',
        'content-length': '3',
        'x-powered-by': 'Express',
        'x-request-id': '1234',
      },
    });
  });

  it('does not invoke the handler on different webhook root', async () => {
    const testHandler = new TestHandler();

    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withWebhookSecret(WEBHOOK_SECRET)
      .withHandler(testHandler.invoker())
      .withGithubToken('dummy')
      .withWebHookPath('/wrong')
      .create();

    const result = await main(await createTestPayload({}, '/somepath'));

    assert.ok(!testHandler.invoked);
    assert.equal(testHandler.testParam, 'test-param');
    delete result.headers.date;
    assert.deepEqual(result, {
      body: '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot POST /somepath</pre>\n</body>\n</html>\n',
      headers: {
        'cache-control': 'no-store, must-revalidate',
        connection: 'close',
        'content-length': '148',
        'content-security-policy': "default-src 'self'",
        'content-type': 'text/html; charset=utf-8',
        'x-content-type-options': 'nosniff',
        'x-powered-by': 'Express',
        'x-request-id': '1234',
      },
      statusCode: 404,
    });
  });

  it('invokes the handler via params', async () => {
    const testHandler = new TestHandler();

    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withWebhookSecret(WEBHOOK_SECRET)
      .withHandler(testHandler.invoker())
      .withGithubToken('dummy')
      .create();

    const result = await main(await createRawTestPayload());

    assert.ok(testHandler.invoked);
    assert.equal(testHandler.testParam, 'test-param');

    delete result.headers.date;
    assert.deepEqual(result, {
      body: 'ok\n',
      statusCode: 200,
      headers: {
        'cache-control': 'no-store, must-revalidate',
      },
    });
  });

  it('does not invoke the handler and responds with 500 for wrong signature', async () => {
    const testHandler = new TestHandler();

    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withWebhookSecret('notmysecret')
      .withHandler(testHandler.invoker())
      .withGithubToken('dummy')
      .create();

    const result = await main(await createTestPayload());

    assert.ok(!testHandler.invoked);
    delete result.headers.date;
    assert.deepEqual(result, {
      body: 'Error: signature does not match event payload and secret',
      headers: {
        'cache-control': 'no-store, must-revalidate',
        connection: 'close',
        'content-length': '56',
        'x-powered-by': 'Express',
        'x-request-id': '1234',
      },
      statusCode: 400,
    });
  });

  it('invokes 2 handlers', async () => {
    const testHandler1 = new TestHandler();
    const testHandler2 = new TestHandler();

    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withWebhookSecret(WEBHOOK_SECRET)
      .withHandler(testHandler1.invoker())
      .withHandler(testHandler2.invoker())
      .withGithubToken('dummy')
      .create();

    const result = await main(await createTestPayload());

    assert.ok(testHandler1.invoked);
    assert.equal(testHandler1.testParam, 'test-param');
    assert.ok(testHandler2.invoked);
    assert.equal(testHandler2.testParam, 'test-param');
    delete result.headers.date;
    assert.deepEqual(result, {
      body: 'ok\n',
      statusCode: 200,
      headers: {
        'cache-control': 'no-store, must-revalidate',
        connection: 'close',
        'content-length': '3',
        'x-powered-by': 'Express',
        'x-request-id': '1234',
      },
    });
  });

  it('invokes the resolved handler', async () => {
    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withWebhookSecret(WEBHOOK_SECRET)
      .withHandler('./test/fixtures/issues-opened-handler.js')
      .withGithubToken('dummy')
      .create();

    const testContext = {};
    const result = await main(await createTestPayload(testContext));

    assert.ok(testContext.invoked);
    delete result.headers.date;
    assert.deepEqual(result, {
      body: 'ok\n',
      statusCode: 200,
      headers: {
        'cache-control': 'no-store, must-revalidate',
        connection: 'close',
        'content-length': '3',
        'x-powered-by': 'Express',
        'x-request-id': '1234',
      },
    });
  });

  it('it can set APP_ID and WEBHOOK_SECRET from params', async () => {
    const wrapper = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withWebhookSecret(WEBHOOK_SECRET)
      .withHandler('./test/fixtures/issues-opened-handler.js');

    const payload = await createTestPayload({});
    payload.GH_APP_ID = '1234';
    payload.GH_WEBHOOK_SECRET = 'test';
    await wrapper.create()(payload);

    assert.ok(wrapper._appId, '1234');
    assert.ok(wrapper._secret, 'test');
  });

  it('it can set APP_ID and WEBHOOK_SECRET from process.env', async () => {
    const wrapper = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withWebhookSecret(WEBHOOK_SECRET)
      .withHandler('./test/fixtures/issues-opened-handler.js');

    const payload = await createTestPayload({});
    process.env.APP_ID = '1234';
    process.env.WEBHOOK_SECRET = 'test';
    await wrapper.create()(payload);

    assert.ok(wrapper._appId, '1234');
    assert.ok(wrapper._secret, 'test');
  });

  it('it can set APP_ID and WEBHOOK_SECRET via setters', async () => {
    const wrapper = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withWebhookSecret(WEBHOOK_SECRET)
      .withHandler('./test/fixtures/issues-opened-handler.js')
      .withAppId(1234);

    const payload = await createTestPayload({});
    await wrapper.create()(payload);

    assert.ok(wrapper._appId, '1234');
    assert.ok(wrapper._secret, WEBHOOK_SECRET);
  });

  it('error during init probot sends 500', async () => {
    const wrapper = new OpenWhiskWrapper()
      .withWebhookSecret(WEBHOOK_SECRET);
    const payload = await createTestPayload({});
    const result = await wrapper.create()(payload);
    assert.equal(result.statusCode, 500);
  });

  it('error in handler sends 500', async () => {
    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withWebhookSecret(WEBHOOK_SECRET)
      .withHandler('./test/fixtures/issues-opened-handler.js')
      .withGithubToken('dummy')
      .create();

    const testContext = {
      fail: true,
    };
    const result = await main(await createTestPayload(testContext));
    assert.equal(result.statusCode, 500);
  });
});
