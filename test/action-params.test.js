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
/* eslint-disable no-underscore-dangle */

const assert = require('assert');
const path = require('path');

const ActionBuilder = require('../src/cli/action_builder.js');

describe('Action Builder Test - Params', () => {
  it('can set 1 env param', () => {
    const a = new ActionBuilder()
      .withParams('KEY=123');

    assert.deepEqual(a._params, {
      KEY: '123',
    });
  });

  it('can set 2 env params', () => {
    const a = new ActionBuilder()
      .withParams('KEY=123')
      .withParams('TOKEN=abc');

    assert.deepEqual(a._params, {
      KEY: '123',
      TOKEN: 'abc',
    });
  });

  it('can set 1 json param', () => {
    const a = new ActionBuilder()
      .withParams('{"KEY": "123"}');

    assert.deepEqual(a._params, {
      KEY: '123',
    });
  });

  it('can set 2 json param', () => {
    const a = new ActionBuilder()
      .withParams('{"KEY": "123"}')
      .withParams('{"TOKEN": "abc"}');

    assert.deepEqual(a._params, {
      KEY: '123',
      TOKEN: 'abc',
    });
  });

  it('fail for missing params file', () => {
    let error = null;
    try {
      new ActionBuilder()
        .withParamsFile(path.resolve(__dirname, 'fixtures', 'params-test-missing.env'));
    } catch (e) {
      error = e;
    }
    assert.notEqual(error, null, 'missing params-file must fail');
  });

  it('can set params from env file', () => {
    const a = new ActionBuilder()
      .withParamsFile(path.resolve(__dirname, 'fixtures', 'params-test.env'));

    assert.deepEqual(a._params, {
      EXPIRES: 'false',
      TITLE: 'Hello, World.',
    });
  });

  it('can set params from json file', () => {
    const a = new ActionBuilder()
      .withParamsFile(path.resolve(__dirname, 'fixtures', 'params-test.json'));

    assert.deepEqual(a._params, {
      jobs: [
        {
          completed: false,
          title: 'Why me?',
        },
      ],
    });
  });

  it('can set params via array or strings and files', () => {
    const a = new ActionBuilder()
      .withParams([
        '{"KEY": "123"}',
        'TOKEN=abc',
      ])
      .withParamsFile([
        path.resolve(__dirname, 'fixtures', 'params-test.env'),
        path.resolve(__dirname, 'fixtures', 'params-test.json'),
      ]);

    assert.deepEqual(a._params, {
      EXPIRES: 'false',
      KEY: '123',
      TITLE: 'Hello, World.',
      TOKEN: 'abc',
      jobs: [
        {
          completed: false,
          title: 'Why me?',
        },
      ],
    });
  });
});
