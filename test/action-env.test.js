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

const assert = require('assert');

const ActionBuilder = require('../src/cli/action_builder.js');

describe('Action Builder Test - Env', () => {
  it('writes proper env', () => {
    const o = {
      KEY: 1234,
      TOKEN: 'abc',
      MULTILINE: 'foo\nbar',
      DQUOTES: '"Hello"',
      SQUOTES: '\'Hello\'',
    };
    const env = ActionBuilder.toEnv(o);
    assert.equal(env, `KEY=1234
TOKEN="abc"
MULTILINE="foo\\nbar"
DQUOTES="\\"Hello\\""
SQUOTES="'Hello'"
`);
  });
});
