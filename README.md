# Code Graph Search

This is a CDK TypeScript project for Code Graph Search, which allows you to analyze and search code repositories using AWS services.

## Prerequisites

- Node.js (version 22.x or later)
- AWS CLI configured with appropriate credentials
- AWS CDK CLI installed globally

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Install Lambda dependencies:
   ```
   npm run install-lambda-deps
   ```

## Configuration

1. Update the `cdk.json` file with your specific configuration if needed.
2. Set up any required environment variables for Lambda functions.

## Deployment

To deploy the entire stack:

```
npm run deployAll
```

## Project Structure

- `bin/`: Contains the entry point for the CDK app
- `lib/`: Defines the CDK stack
- `lambda/`: Contains Lambda function code
- `client/`: Vue.js frontend application

## Usage

After deployment:
1. Access the frontend application using the CloudFront URL provided in the CDK output.
2. Use the UI to analyze and search code repositories.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npm run buildClient`   build the client application
* `npm run install-lambda-deps`   install Lambda dependencies
* `npm run deployAll`   deploy the entire stack
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template