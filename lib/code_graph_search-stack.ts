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
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

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
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });
    vpc.addInterfaceEndpoint('BedrockEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
    });
    vpc.addInterfaceEndpoint('SQSEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SQS,
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

    // Define the S3
    const codeDownloadBucket = new s3.Bucket(this, 'Code Download Bucket', {
      bucketName: 'code-download-bucket',
      versioned: true,
    });

    // Define the SQS
    const codeDownloadDlq = new sqs.Queue(this, 'Code Download DLQ', {
      visibilityTimeout: cdk.Duration.seconds(900),
    });
    const codeDownloadQueue = new sqs.Queue(this, 'Code Download Queue', {
      visibilityTimeout: cdk.Duration.seconds(900),
      deadLetterQueue: {
        queue: codeDownloadDlq,
        maxReceiveCount: 10,
      },
    });

    const codeReaderDlq = new sqs.Queue(this, 'Code Reader DLQ', {
      visibilityTimeout: cdk.Duration.seconds(900),
    });
    const codeReaderQueue = new sqs.Queue(this, 'Code Reader Queue', {
      visibilityTimeout: cdk.Duration.seconds(900),
      deadLetterQueue: {
        queue: codeReaderDlq,
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
    const codeDownloadLambdaRole = new iam.Role(this, 'CodeDownloadLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
      ],
    });


    const codeGraphSearchLambdaRole = new iam.Role(this, 'CreateCodeGraphRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('NeptuneFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSQSFullAccess'),
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
    // 1. Code Downloader Lambda, out of VPC.
    const codeDownloadLambdaFunction = new lambda.Function(this, 'CodeDownloaderFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset('./lambda/codeDownloader'),
      handler: 'index.handler',
      role: codeDownloadLambdaRole,
      timeout: cdk.Duration.minutes(2),
      memorySize: 128,
    });
    codeDownloadLambdaFunction.addEnvironment('S3_BUCKET_NAME', codeDownloadBucket.bucketName);
    codeDownloadLambdaFunction.addEnvironment('CODE_DOWNLOAD_QUEUE_URL', codeDownloadQueue.queueUrl);
    codeDownloadQueue.grantSendMessages(codeDownloadLambdaFunction);

    // 2. Code Reader Lambda, in the VPC.
    const codeReaderLambdaFunction = new lambda.Function(this, 'CodeReaderFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset('./lambda/codeReader'),
      handler: 'index.handler',
      role: codeGraphSearchLambdaRole,
      timeout: cdk.Duration.minutes(15),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      memorySize: 512,
    });
    codeReaderLambdaFunction.addEnvironment('REGION', this.region);
    codeReaderLambdaFunction.addEnvironment('S3_BUCKET_NAME', codeDownloadBucket.bucketName);
    codeReaderLambdaFunction.addEnvironment('PRIVATE_BEDROCK_DNS', `bedrock-runtime.${this.region}.amazonaws.com`);
    codeReaderLambdaFunction.addEnvironment('CODE_READER_QUEUE_URL', codeReaderQueue.queueUrl);

    codeReaderQueue.grantSendMessages(codeReaderLambdaFunction);
    codeReaderLambdaFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(codeDownloadQueue, {
        batchSize: 10,
      })
    );

    // 3. Code Summarizer Lambda, in the VPC.
    const codeSummarizerLambdaFunction = new lambda.Function(this, 'CodeSummarizerFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset('./lambda/codeSummarizer'),
      handler: 'index.handler',
      role: codeGraphSearchLambdaRole,
      timeout: cdk.Duration.minutes(15),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      memorySize: 512,
    });
    codeSummarizerLambdaFunction.addEnvironment('REGION', this.region);
    codeSummarizerLambdaFunction.addEnvironment('S3_BUCKET_NAME', codeDownloadBucket.bucketName);
    codeSummarizerLambdaFunction.addEnvironment('PRIVATE_BEDROCK_DNS', `bedrock-runtime.${this.region}.amazonaws.com`);
    codeSummarizerLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_DNS', neptuneCluster.attrReadEndpoint);
    codeSummarizerLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_PORT', neptuneCluster.attrPort);
    codeSummarizerLambdaFunction.addEnvironment('OPENSEARCH_DNS', codeGraphOpenSearch.attrDomainEndpoint);

    codeSummarizerLambdaFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(codeReaderQueue, {
        batchSize: 10,
      })
    );


    // Code Search Lambda, in the VPC.
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
      memorySize: 128,
    });
    searchCodeGraphLambdaFunction.addEnvironment('REGION', this.region);
    searchCodeGraphLambdaFunction.addEnvironment('S3_ENDPOINT', ec2.GatewayVpcEndpointAwsService.S3.name);
    searchCodeGraphLambdaFunction.addEnvironment('PRIVATE_BEDROCK_DNS', `bedrock-runtime.${this.region}.amazonaws.com`);
    searchCodeGraphLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_DNS', neptuneCluster.attrReadEndpoint);
    searchCodeGraphLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_PORT', neptuneCluster.attrPort);
    searchCodeGraphLambdaFunction.addEnvironment('OPENSEARCH_DNS', codeGraphOpenSearch.attrDomainEndpoint);


    // 4. Graph Search Management Lambda, in the VPC.
    const graphSearchManagementLambdaFunction = new lambda.Function(this, 'GraphSearchManagementFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset('./lambda/graphSearchManagement'),
      handler: 'index.handler',
      role: codeGraphSearchLambdaRole,
      timeout: cdk.Duration.seconds(10),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      memorySize: 128,
    });
    graphSearchManagementLambdaFunction.addEnvironment('REGION', this.region);
    graphSearchManagementLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_DNS', neptuneCluster.attrReadEndpoint);
    graphSearchManagementLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_PORT', neptuneCluster.attrPort);
    graphSearchManagementLambdaFunction.addEnvironment('OPENSEARCH_DNS', codeGraphOpenSearch.attrDomainEndpoint);

    // Define the API Gateway
    const api = new apigateway.LambdaRestApi(this, 'CodeGraphApi', {
      handler: codeDownloadLambdaFunction,
      proxy: false,
    });

    const createCodeGraphResource = api.root.addResource('createCodeGraph');
    createCodeGraphResource.addMethod('POST', new apigateway.LambdaIntegration(codeDownloadLambdaFunction));
    new cdk.CfnOutput(this, 'CodeGraphApiEndpoint', {
      value: api.url,
      description: '[POST] Endpoint for the create Code Graph API',
    });

    const searchCodeGraphResource = api.root.addResource('searchCodeGraph');
    searchCodeGraphResource.addMethod('GET', new apigateway.LambdaIntegration(searchCodeGraphLambdaFunction));
    new cdk.CfnOutput(this, 'SearchCodeGraphApiEndpoint', {
      value: api.url,
      description: '[GET] Endpoint for the Search Code Graph API',
    });

    const graphSearchManagementResource = api.root.addResource('graphSearchManagement');
    graphSearchManagementResource.addMethod('POST', new apigateway.LambdaIntegration(graphSearchManagementLambdaFunction));
    new cdk.CfnOutput(this, 'GraphSearchManagementApiEndpoint', {
      value: api.url,
      description: '[POST] for the management of the Code Graph API',
    });
  }
}
