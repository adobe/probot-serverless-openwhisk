# Serverless Probot on Openwhisk
> A wrapper to run a GitHub App built with [Probot](https://probot.github.io) as an OpenWhisk action. 

Running a Probot app in OpenWhisk might be a bit challenging as the action invocation params need to
be translated into a probot event. This package offers an easy wrapper to turn an existing
probot app into an OpenWhisk action.

Table of Contents
=================

   * [Serverless Probot on Openwhisk](#serverless-probot-on-openwhisk)
      * [Status](#status)
      * [Setup](#setup)
      * [Passing the OpenWhisk action params into the handler](#passing-the-openwhisk-action-params-into-the-handler)
      * [CLI](#cli)
         * [Automatically deploy to openwhisk](#automatically-deploy-to-openwhisk)
         * [Automatically <em>test</em> the deployed action](#automatically-test-the-deployed-action)
         * [Including action parameters](#including-action-parameters)
         * [Including static files](#including-static-files)
         * [Specifying the arguments in the package.json](#specifying-the-arguments-in-the-packagejson)
      * [Enabling local development](#enabling-local-development)
      * [Notes](#notes)
         * [Bundling](#bundling)
      * [Contributing](#contributing)
      
## Status
[![GitHub license](https://img.shields.io/github/license/adobe/probot-serverless-openwhisk.svg)](https://github.com/adobe/probot-serverless-openwhisk/blob/main/LICENSE.txt)
[![GitHub issues](https://img.shields.io/github/issues/adobe/probot-serverless-openwhisk.svg)](https://github.com/adobe/probot-serverless-openwhisk/issues)
[![CircleCI](https://img.shields.io/circleci/project/github/adobe/probot-serverless-openwhisk.svg)](https://circleci.com/gh/adobe/probot-serverless-openwhisk)
[![codecov](https://img.shields.io/codecov/c/github/adobe/probot-serverless-openwhisk.svg)](https://codecov.io/gh/adobe/probot-serverless-openwhisk)

[![LGTM Code Quality Grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/adobe/probot-serverless-openwhisk.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/adobe/probot-serverless-openwhisk)

## Setup

1. Create a [Probot](https://probot.github.io) app following GitHub's instructions

2. Add this wrapper as dependency:
    ```sh
    # Add OpenWhisk wrapper as dependency 
    npm add probot-serverless-openwhisk
    npm add --save-dev openwhisk-probot-builder
    ```

3. Add an `index.js`:
    ```js
    const { OpenWhiskWrapper, ViewsHelper } = require('@adobe/probot-serverless-openwhisk');
    const app = require('./src/probot_app.js');
    
    const wrapper = new OpenWhiskWrapper()
      .withViewsDirectory('./src/views')
      .withApp(app)
      .withApp(new ViewsHelper()
        .withView('/docs', 'docs.hbs')
        .register());

    module.exports = {
      main: wrapper.create(),
      wrapper,
    };
    ```

4. Build the OpenWhisk action
    ```sh
    $ ./node_modules/.bin/wskbot
    ...
    Created action: dist/probot-openwhisk-example.zip.
    ```
5. Deploy the OpenWhisk action
    ```sh
    $ wsk action update probot-openwhisk-example --kind nodejs:10 --web raw dist/probot-openwhisk-example.zip
    ```

6. Set the correct [GitHub app settings](https://github.com/settings/apps):    
    
    * **Homepage URL:** https://adobeioruntime.net/api/v1/web/$WSK_NAMESPACE/default/probot-openwhisk-example/probot
    * **Webhook URL:** https://adobeioruntime.net/api/v1/web/$WSK_NAMESPACE/default/probot-openwhisk-example

## Passing the OpenWhisk action params into the handler

Sometimes the handler needs access to the action params, especially if they are deployment provided
and might contain keys or tokens. This wrapper passes them along when it initializes the handler with an additional
argument. 

Example:

```js
module.exports = (app, actionParams = {}) => {
  app.log('Yay, my app is loaded');

  const MY_TOKEN = actionParams.MY_TOKEN || '';
  .
  .
```

The deploy parameters can be specified in the CLI via `-p`. See below.

## CLI

The command-line interface `wskbot` can be invoked via `./node_modules/.bin/wskbot`. 
Alternatively, you can also use npx: `npx wskbot` or install it globally `npm install -g probot-serverless-openwhisk`.

```
$ wskbot --help
Operation Options
  --build              Build the deployment package    [boolean] [default: true]
  --deploy             Automatically deploy to OpenWhisk
                                                      [boolean] [default: false]
  --test               Invoke action after deployment [boolean] [default: false]
  --hints, --no-hints  Show additional hints for deployment
                                                       [boolean] [default: true]
  --update-package     Create or update wsk package.  [boolean] [default: false]

OpenWhisk Action Options
  --name             OpenWhisk action name. Can be prefixed with package.
  --kind             Specifies the action kind.                    [default: ""]
  --docker           Specifies a docker image.
  --params, -p       Include the given action param. can be json or env.
                                                           [array] [default: []]
  --params-file, -f  Include the given action param from a file; can be json or
                     env.                                  [array] [default: []]
  --web-export       Annotates the action as web-action[boolean] [default: true]
  --raw-http         Annotates the action as raw web-action (enforces
                     web-export=true)                  [boolean] [default: true]

OpenWhisk Package Options
  --package.name         OpenWhisk package name.                        [string]
  --package.params       OpenWhisk package params.         [array] [default: []]
  --package.params-file  OpenWhisk package params file.    [array] [default: []]
  --package.shared       OpenWhisk package scope.     [boolean] [default: false]

Bundling Options
  --static, -s  Includes a static file into the archive    [array] [default: []]
  --entryFile   Specifies the entry file.              [default: "src/index.js"]
  --externals   Defines the externals for webpack.         [array] [default: []]

GitHub Options
  --github-key  Specify the GitHub private key file

Options:
  --version      Show version number                                   [boolean]
  --verbose, -v                                       [boolean] [default: false]
  --pkgVersion   Version use in the embedded package.json.
  --modules, -m  Include a node_module as is.              [array] [default: []]
  --help         Show help                                             [boolean]
```

With no arguments, the `wskbot` just bundles your code into the respective `action.zip`:

```
$ wskbot
ok: created action: dist/probot-openwhisk-example.zip.
Deploy to openwhisk the following command or specify --deploy on the commandline:
$ wsk action update probot-openwhisk-example --kind nodejs:10 --web raw dist/probot-openwhisk-example.zip

GitHub App Settings:
Homepage URL: https://adobeioruntime.net/api/v1/web/tripod/default/probot-openwhisk-example/probot
 Webhook URL: https://adobeioruntime.net/api/v1/web/tripod/default/probot-openwhisk-example
```

### Automatically deploy to openwhisk

When passing the `--deploy` argument, the `wskbot` will try to deploy it to OpenWhisk using the settings from
`~/.wskprops`. Alternatively, you can also set the `WSK_NAMESPACE`, `WSK_AUTH`, `WSK_APIHOST` variables in your
environment or `.env` file.

```
$ wskbot --deploy --no-hints
ok: created action: dist/probot-openwhisk-example.zip.
ok: updated action tripod/probot-openwhisk-example
```  

### Automatically _test_ the deployed action

To quickly test the deployed action, `wskbot` can send a `GET` request to the action url.

```
$ wskbot --deploy --no-hints --test
ok: created action: dist/probot-openwhisk-example.zip.
ok: updated action tripod/probot-openwhisk-example
--: requesting: https://runtime.adobe.io/api/v1/web/tripod/default/probot-openwhisk-example ...
ok: 200
```

..or sometimes:

```
$ wskbot --deploy --no-hints --test
ok: created action: dist/probot-openwhisk-example.zip.
ok: updated action tripod/probot-openwhisk-example
--: requesting: https://runtime.adobe.io/api/v1/web/tripod/default/probot-openwhisk-example ...
error:  400 - "{\n  \"error\": \"Response is not valid 'message/http'.\",\n  \"code\": \"av6qzDTHdgd5dfg7WOynEjbVnTdE5JhnB4c\"\n}"
```

### Including action parameters

Action parameters can be defined via `-p`, either as json on env string, or json or env file.

Examples:

```bash
# specify as env string
wskbot -p MY_TOKEN=1234 -p MY_PWD=foo

# specify as json string
wskbot -p '{ "MY_TOKEN": 1234, "MY_PWD": "foo" }'

# specify as env file
wskbot -p .env

# specify as json file
wskbot -p params.json

# and a combination of the above
wskbot -p .env -p params.json -p MY_TOKEN=123

# like in curl, you can include file contents with `@` (also works in .env or .json file)
wskbot -p MY_TOKEN=@token.txt
```

### Including static files

Adding static files, i.e. files that are not referenced from the `index.js` and detected by webpack,
can be done via the `-s` parameter. they are always put into the root directory of the archive.

Example:

```bash
# include an image
wskbot -s logo.png
```
 
### Specifying the arguments in the `package.json`

Instead of having very a long argument list, the parameters described above can also be specified in
the `package.json`. see the [action-builder documentation](https://github.com/adobe/openwhisk-action-builder#specifying-arguments-in-the-packagejson)
for more details. 

## Enabling local development

In your github app project, create a `dev.js` with:

```js
const { DevelopmentServer } = require('@adobe/probot-serverless-openwhisk');
const { wrapper } = require('./index.js');

async function run() {
  const devServer = await new DevelopmentServer(wrapper).init();
  return devServer.run();
}

run().then(process.stdout).catch(process.stderr);
```

and then run `node dev.js`. this starts a probot server which an optional smee.io client.
you can add the smee url via a `WEBHOOK_PROXY_URL` entry in the `.env` file.

## Notes

### Bundling

The action is created using webpack to create a bundle for the sources and then creates a zip archive
with the bundle, a `package.json`, the private key files and the `.env`.

## Contributing

If you have suggestions for how this OpenWhisk probot wrapper could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).
