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

function isFunction(obj) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
}

class ViewHandler {
  constructor() {
    this._routes = [];
  }

  withRoute(name, template) {
    this._routes[name] = template;
    return this;
  }

  init(app) {
    const router = app.route('/');

    Object.keys(this._routes).forEach((r) => {
      app.log.info('register: %s', r);

      router.get(r, (req, res) => {
        app.log.info('Serving: %s', r);

        let view = this._routes[r];
        if (isFunction(view)) {
          view = view();
        }
        // if (view.then) {
        //   view = await view;
        // }
        if (typeof view === 'string') {
          res.set('cache-control', 'max-age=86400');
          res.send(view);
          return;
        }
        //return view;

      });
    });

  }
}
module.exports = ViewHandler;
