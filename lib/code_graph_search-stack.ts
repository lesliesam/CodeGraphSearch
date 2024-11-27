import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as openSearch from 'aws-cdk-lib/aws-opensearchservice';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

export class CodeGraphSearchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Define the VPC
    const vpc = new ec2.Vpc(this, 'Code Graph Search VPC', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/22'),
      maxAzs: 3,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
      ],
    });

    // Define the Endpoints
    const s3Endpoint = vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });
    const neptuneEndpoint = vpc.addInterfaceEndpoint('BedrockEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
    });

    const neptuneCluster = new neptune.CfnDBCluster(this, 'NeptuneCluster', {
      dbClusterIdentifier: 'code-graph-neptune-cluster',
      vpcSecurityGroupIds: [],
      dbSubnetGroupName: new neptune.CfnDBSubnetGroup(this, 'NeptuneSubnetGroup', {
        dbSubnetGroupDescription: 'Subnet group for Neptune cluster',
        subnetIds: vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED
        }).subnetIds,
      }).ref,
    });

    // Define the Lambda roles
    const createCodeGraphSearchLambdaRole = new iam.Role(this, 'CodeGraphSearchRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('NeptuneFullAccess'),
      ],
    });

    // Define the lambda functions
    const createCodeGraphLambdaFunction = new lambda.Function(this, 'CreateCodeGraphFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset('./lambda/createCodeGraph'),
      handler: 'index.handler',
      role: createCodeGraphSearchLambdaRole,
      timeout: cdk.Duration.minutes(2),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });
    // Add Lambda environment variables
    createCodeGraphLambdaFunction.addEnvironment('S3_ENDPOINT', ec2.GatewayVpcEndpointAwsService.S3.name);
    // createCodeGraphLambdaFunction.addEnvironment('NEPTUNE_ENDPOINT', cdk.Fn.select(0, neptuneEndpoint.vpcEndpointDnsEntries));
    createCodeGraphLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_DNS', `bedrock-runtime.${this.region}.amazonaws.com`);

    // Define the API Gateway
    const api = new apigateway.LambdaRestApi(this, 'CodeGraphApi', {
      handler: createCodeGraphLambdaFunction,
      proxy: false,
    });

    const createCodeGraphResource = api.root.addResource('createCodeGraph');
    createCodeGraphResource.addMethod('POST', new apigateway.LambdaIntegration(createCodeGraphLambdaFunction));
  }
}
