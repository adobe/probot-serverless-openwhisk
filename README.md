# Serverless Probot on Openwhisk
> A wrapper to run a GitHub App built with [Probot](https://probot.github.io) as OpenWhisk action. 

## Setup

1. Create a [Probot](https://probot.github.io) app following github's instructions

2. Add this wrapper as dev dependency:
    ```sh
    # Add OpenWhisk wrapper as develop dependency 
    npm add -D serverless-openwhisk
    ```

3. Create the OpenWhisk action

4. Deploy the OpenWhisk action


## Contributing

If you have suggestions for how this OpenWhisk probot wrapper could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[Apache 2.0](LICENSE) © 2018 Tobias Bocanegra <tripod@bocanegra.ch>

### Openwhisk

```
$ wsk action update github-app --docker tripodsan/probot-ow-nodejs8:latest --web raw action.zip
```

https://adobeioruntime.net/api/v1/web/tripod/default/github-app/probot
