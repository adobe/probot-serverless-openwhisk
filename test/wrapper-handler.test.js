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

const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');
const { OpenWhiskWrapper } = require('../index.js');

const PRIVATE_KEY_PATH = path.resolve(__dirname, 'fixtures', 'test-private-key.pem');
const PAYLOAD_ISSUES_OPENED = path.resolve(__dirname, 'fixtures', 'issues.opened.json');

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

async function createTestPayload(testContext) {
  const payload = await fs.readFile(PAYLOAD_ISSUES_OPENED, 'base64');
  return {
    __ow_method: 'post',
    __ow_path: '/static.txt',
    __ow_body: payload,
    __ow_headers: {
      'x-github-event': 'issues.opened',
      'x-github-delivery': 1234,
    },
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
      .withHandler(testHandler.invoker())
      .create();

    const result = await main(await createTestPayload());

    assert.ok(testHandler.invoked);
    assert.equal(testHandler.testParam, 'test-param');
    assert.deepEqual(result, {
      body: '{"message":"ok"}',
      statusCode: 200,
    });
  });

  it('invokes the resolved handler', async () => {
    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withHandler('./test/fixtures/issues-opened-handler.js')
      .create();

    const testContext = {};
    const result = await main(await createTestPayload(testContext));

    assert.ok(testContext.invoked);
    assert.deepEqual(result, {
      body: '{"message":"ok"}',
      statusCode: 200,
    });
  });

  it('it can set APP_ID and WEBHOOK_SECRET from params', async () => {
    const wrapper = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
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
      .withHandler('./test/fixtures/issues-opened-handler.js')
      .withAppId(1234)
      .withWebhookSecret('test');

    const payload = await createTestPayload({});
    await wrapper.create()(payload);

    assert.ok(wrapper._appId, '1234');
    assert.ok(wrapper._secret, 'test');
  });

  it('init probot fails with error', async () => {
    const wrapper = new OpenWhiskWrapper();

    const payload = await createTestPayload({});
    try {
      await wrapper.create()(payload);
      assert.fail('must fail');
    } catch (e) {
      // ok
    }
  });

  it('error during init probot sends 500', async () => {
    const wrapper = new OpenWhiskWrapper();
    const payload = await createTestPayload({});
    const result = await wrapper.create()(payload);
    assert.equal(result.statusCode, 500);
  });

  it('error in handler sends 500', async () => {
    const main = new OpenWhiskWrapper()
      .withGithubPrivateKey(await fs.readFile(PRIVATE_KEY_PATH))
      .withHandler('./test/fixtures/issues-opened-handler.js')
      .create();

    const testContext = {
      fail: true,
    };
    const result = await main(await createTestPayload(testContext));
    assert.equal(result.statusCode, 500);
  });
});
