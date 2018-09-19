# Serverless Probot on Openwhisk
> A wrapper to run a GitHub App built with [Probot](https://probot.github.io) as OpenWhisk action. 

Running a Probot app in OpenWhisk might be a bit challenging as the action invocation params need to
be translated into a probot event. This package offers an easy wrapper to turn an existing
probot app into an OpenWhisk action.

## Status
[![GitHub license](https://img.shields.io/github/license/tripodsan/probot-serverless-openwhisk.svg)](https://github.com/tripodsan/probot-serverless-openwhisk/blob/master/LICENSE.txt)
[![GitHub issues](https://img.shields.io/github/issues/tripodsan/probot-serverless-openwhisk.svg)](https://github.com/tripodsan/probot-serverless-openwhisk/issues)
[![CircleCI](https://img.shields.io/circleci/project/github/probot-serverless-openwhisk.svg)](https://circleci.com/gh/probot-serverless-openwhisk)
[![Greenkeeper badge](https://badges.greenkeeper.io/tripodsan/probot-serverless-openwhisk.svg)](https://greenkeeper.io/)
[![LGTM Code Quality Grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/tripodsan/probot-serverless-openwhisk.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/tripodsan/probot-serverless-openwhisk)

## Setup

1. Create a [Probot](https://probot.github.io) app following github's instructions

2. Add this wrapper as dev dependency:
    ```sh
    # Add OpenWhisk wrapper as develop dependency 
    npm add -D probot-serverless-openwhisk
    ```

3. Add an `index.js`:
    ```js
    const { OpenWhiskWrapper } = require('probot-servleless-openwhisk');
    const app = require('./src/probot_app.js');
    const view = require('./src/views/probot.js');
    
    module.exports.main = new OpenWhiskWrapper()
      .withHandler(app)
      .withRoute('/probot', view)
      .create();
    ```

4. Build the OpenWhisk action
    ```sh
    $ ./node_modules/.bin/wskbot
    ...
    Created action: dist/probot-openwhisk-example.zip.
    ```
5. Deploy the OpenWhisk action
    ```sh
    $ wsk action update probot-openwhisk-example --docker tripodsan/probot-ow-nodejs8:latest --web raw dist/probot-openwhisk-example.zip
    ```

6. Set the correct [github app settings](https://github.com/settings/apps):    
    
    * **Homepage URL:** https://adobeioruntime.net/api/v1/web/$WSK_NAMESPACE/default/probot-openwhisk-example/probot
    * **Webhook URL:** https://adobeioruntime.net/api/v1/web/$WSK_NAMESPACE/default/probot-openwhisk-example

## CLI

The command line interface `wskbot` doesn't take any arguments at the moment. 

## Notes

### Bundling

The action is created using webpack to create bundle for the sources and then creates a zip archive
with the bundle, a `package.json`, the private key files and the `.env`.

### Docker Image

The action needs a special docker image [tripodsan/probot-ow-nodejs8:latest](https://github.com/tripodsan/probot-openwhisk-docker)
that already contains `probot` and its dependencies. This helps to keep the size of the action small. 

## Contributing

If you have suggestions for how this OpenWhisk probot wrapper could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

