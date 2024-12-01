import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
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

    const neptuneSecurityGroup = new ec2.SecurityGroup(this, 'NeptuneSecurityGroup', {
      vpc,
      description: 'Security group for Neptune cluster',
      allowAllOutbound: true,
    });

    // Allow inbound access from the Lambda function's security group
    neptuneSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8182),
      'Allow Neptune access'
    );

    // Define the SQS
    const codeDownloadDlq = new sqs.Queue(this, 'Code Download DLQ', {
      visibilityTimeout: cdk.Duration.seconds(300),
    });
    const codeDownloadQueue = new sqs.Queue(this, 'Code Download Queue', {
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        queue: codeDownloadDlq,
        maxReceiveCount: 10,
      },
    });

    // Define the OpenSearch
    const opensearchSecurityGroup = new ec2.SecurityGroup(this, 'OpenSearchSecurityGroup', {
      vpc,
      description: 'Security group for OpenSearch cluster',
      allowAllOutbound: true,
    });

    opensearchSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow OpenSearch access'
    );

    const subnetGroup = new neptune.CfnDBSubnetGroup(this, 'NeptuneSubnetGroup', {
      dbSubnetGroupDescription: 'Subnet group for Neptune cluster',
      subnetIds: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      }).subnetIds,
    });

    const neptuneCluster = new neptune.CfnDBCluster(this, 'NeptuneCluster', {
      dbClusterIdentifier: 'code-graph-neptune-cluster',
      storageEncrypted: true,
      engineVersion: '1.3.4.0',
      vpcSecurityGroupIds: [neptuneSecurityGroup.securityGroupId],
      dbSubnetGroupName: subnetGroup.ref,
    });

    new neptune.CfnDBInstance(this, 'NeptuneInstance', {
      dbInstanceClass: 'db.t3.medium',
      allowMajorVersionUpgrade: true,
      dbClusterIdentifier: neptuneCluster.ref,
      dbInstanceIdentifier: 'code-graph-neptune-instance',
      availabilityZone: vpc.availabilityZones[0],
      dbSubnetGroupName: subnetGroup.ref,
    }).addDependency(neptuneCluster);

    // Define the Lambda roles
    const codeGraphSearchLambdaRole = new iam.Role(this, 'CreateCodeGraphRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('NeptuneFullAccess'),
      ],
    });

    // OpenSearch Serverless
    const codeGraphOpenSearch = new opensearch.CfnDomain(this, 'OpenSearchDomain', {
      domainName: 'code-graph-opensearch',
      engineVersion: 'OpenSearch_2.15',
      clusterConfig: {
        instanceType: 'r7g.medium.search',
        instanceCount: 1,
        dedicatedMasterEnabled: false,
        zoneAwarenessEnabled: false
      },
      ebsOptions: {
        ebsEnabled: true,
        volumeSize: 10,
        volumeType: 'gp3'
      },
      vpcOptions: {
        subnetIds: [vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          onePerAz: true,
          availabilityZones: [vpc.availabilityZones[0]]
        }).subnetIds[0]],
        securityGroupIds: [opensearchSecurityGroup.securityGroupId]
      },
      encryptionAtRestOptions: {
        enabled: true
      },
      nodeToNodeEncryptionOptions: {
        enabled: true
      },
      accessPolicies: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              AWS: [codeGraphSearchLambdaRole.roleArn]
            },
            Action: 'es:*',
            Resource: `arn:aws:es:${this.region}:${this.account}:domain/code-graph-opensearch/*`
          }
        ]
      }
    });

    // Define the lambda functions
    const codeDownloadLambdaFunction = new lambda.Function(this, 'CreateCodeGraphFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset('./lambda/createCodeGraph'),
      handler: 'index.handler',
      role: codeGraphSearchLambdaRole,
      timeout: cdk.Duration.minutes(2),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });
    codeDownloadLambdaFunction.addEnvironment('S3_ENDPOINT', ec2.GatewayVpcEndpointAwsService.S3.name);
    codeDownloadLambdaFunction.addEnvironment('PRIVATE_BEDROCK_DNS', `bedrock-runtime.${this.region}.amazonaws.com`);
    codeDownloadLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_DNS', neptuneCluster.attrEndpoint);
    codeDownloadLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_PORT', neptuneCluster.attrPort);
    codeDownloadLambdaFunction.addEnvironment('OPENSEARCH_DNS', codeGraphOpenSearch.attrDomainEndpoint);
    

    const searchCodeGraphLambdaFunction = new lambda.Function(this, 'SearchCodeGraphFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset('./lambda/searchCodeGraph'),
      handler: 'index.handler',
      role: codeGraphSearchLambdaRole,
      timeout: cdk.Duration.seconds(10),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });
    searchCodeGraphLambdaFunction.addEnvironment('REGION', this.region);
    searchCodeGraphLambdaFunction.addEnvironment('S3_ENDPOINT', ec2.GatewayVpcEndpointAwsService.S3.name);
    searchCodeGraphLambdaFunction.addEnvironment('PRIVATE_BEDROCK_DNS', `bedrock-runtime.${this.region}.amazonaws.com`);
    searchCodeGraphLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_DNS', neptuneCluster.attrReadEndpoint);
    searchCodeGraphLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_PORT', neptuneCluster.attrPort);
    searchCodeGraphLambdaFunction.addEnvironment('OPENSEARCH_DNS', codeGraphOpenSearch.attrDomainEndpoint);

    // Define the API Gateway
    const api = new apigateway.LambdaRestApi(this, 'CodeGraphApi', {
      handler: codeDownloadLambdaFunction,
      proxy: false,
    });

    const createCodeGraphResource = api.root.addResource('createCodeGraph');
    createCodeGraphResource.addMethod('POST', new apigateway.LambdaIntegration(codeDownloadLambdaFunction));

    const searchCodeGraphResource = api.root.addResource('searchCodeGraph');
    searchCodeGraphResource.addMethod('GET', new apigateway.LambdaIntegration(searchCodeGraphLambdaFunction));
  }
}
