/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
const pino = require('pino');
const { InterfaceBase } = require('@adobe/helix-log');

const serializers = {
  res: (res) => {
    /* istanbul ignore next */
    if (!res || !res.statusCode) {
      return res;
    }
    return {
      statusCode: res.statusCode,
      duration: res.duration,
      headers: res.getHeaders(),
    };
  },
  req: pino.stdSerializers.req,
  err: pino.stdSerializers.err,
};

function pino2hlxLevel(lvl) {
  if (lvl < 10) {
    return 'silly';
  }
  if (lvl < 20) {
    return 'trace';
  }
  if (lvl < 30) {
    return 'debug';
  }
  if (lvl < 40) {
    return 'info';
  }
  if (lvl < 50) {
    return 'warn';
  }
  if (lvl < 60) {
    return 'error';
  }
  return 'fatal';
}

class PinoInterface extends InterfaceBase {
  constructor() {
    super();
    this[pino.symbols.needsMetadataGsym] = true;
  }

  write() {
    const {
      msg,
      ...fields
    } = this.lastObj;

    Object.entries(fields).forEach(([key, value]) => {
      if (key in serializers) {
        fields[key] = serializers[key](value);
      }
    });

    const time = this.lastTime;
    let timestamp;
    try {
      timestamp = new Date(Number(time));
    } catch (e) {
      timestamp = new Date();
    }
    const level = pino2hlxLevel(this.lastLevel);
    this._logImpl({
      ...fields,
      message: [msg],
      level,
      timestamp,
    });
  }
}

module.exports = PinoInterface;
