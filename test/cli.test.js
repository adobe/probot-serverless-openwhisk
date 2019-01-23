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

const CLI = require('../src/cli/cli.js');

// we only thest own own params. the rest is tested in openwhisk-action-builder
describe('CLI Test', () => {
  it('has correct defaults with no arguments', () => {
    const builder = new CLI(true).prepare();
    assert.equal(builder._privateKey, null);
    assert.equal(builder._docker, 'tripodsan/probot-ow-nodejs8:latest');
  });

  it('sets github key', () => {
    const builder = new CLI(true)
      .prepare(['--github-key', 'foo']);
    assert.equal(builder._privateKey, 'foo');
  });
});
