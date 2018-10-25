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

// ensure that env is loaded as soon as possible. unfortunately, probot doesn't offer a way to
// set the log_format, once it's created the logger. for openwhisk, we can't really use the
// colored logs, as they don't show nicely in the activation logs.
//
// Also, webpack will load the external modules before the bundled ones, so we put this little
// loader in place to ensure the env is set first.

process.env.LOG_FORMAT = 'simple';
require('dotenv').config();

// eslint-disable-next-line import/no-unresolved
module.exports.main = require('./app.js').main;
