import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as openSearchServerless from 'aws-cdk-lib/aws-opensearchserverless';
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

    const seachCodeGraphLambdaRole = new iam.Role(this, 'SearchCodeGraphRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockReadOnly'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceReadOnlyAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('NeptuneGraphReadOnlyAccess'),
      ],
    });

    // OpenSearch Serverless
    const codeGraphOpenSearchDomain = new openSearchServerless.CfnCollection(this, 'OpenSearchCollection', {
      name: 'code-graph-opensearch',
      type: 'VECTORSEARCH',
      standbyReplicas: "DISABLED"  // Need to Enable this option for production.
    });

    const collectionName = `collection/${codeGraphOpenSearchDomain.name}`;
    const codeGraphAccessPolicy = new openSearchServerless.CfnAccessPolicy(this, 'OpenSearchAccessPolicy', {
      name: 'opensearch-access',
      type: 'data',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'index',
              Resource: [`index/*/*`],
              Permission: [
                'aoss:ReadDocument',
                'aoss:WriteDocument',
                'aoss:CreateIndex',
                'aoss:DeleteIndex',
                'aoss:UpdateIndex',
                'aoss:DescribeIndex',
              ],
            },
            {
              ResourceType: 'collection',
              Resource: [collectionName],
              Permission: [
                'aoss:CreateCollectionItems',
                'aoss:DeleteCollectionItems',
                'aoss:UpdateCollectionItems',
                'aoss:DescribeCollectionItems',
              ],
            },
          ],
          Principal: [createCodeGraphSearchLambdaRole.roleArn, seachCodeGraphLambdaRole.roleArn],
        },
      ])
    });

    const codeGraphOpenSearchEncryptionPolicy = new openSearchServerless.CfnSecurityPolicy(this, 'OpenSearchEncryptionPolicy', {
      name: 'code-graph-opensearch-encryption',
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          {
            ResourceType: 'collection',
            Resource: [collectionName],
          },
        ],
        AWSOwnedKey: true,
      })
    });

    const codeGraphVPCE = new openSearchServerless.CfnVpcEndpoint(this, 'OpenSearchVpcEndpoints', {
      name: 'code-graph-opensearch-vpce',
      vpcId: vpc.vpcId,
      securityGroupIds: [opensearchSecurityGroup.securityGroupId],
      subnetIds: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      }).subnetIds
    });

    const codeGraphOpenSearchNetworkPolicy = new openSearchServerless.CfnSecurityPolicy(this, 'OpenSearchNetworkPolicy', {
      name: 'code-graph-opensearch-network',
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [collectionName],
            },
            {
              ResourceType: 'dashboard',
              Resource: [collectionName],
            },
          ],
          SourceVPCEs: [codeGraphVPCE.attrId]
        }
      ])
    });

    codeGraphOpenSearchDomain.addDependency(codeGraphAccessPolicy);
    codeGraphOpenSearchDomain.addDependency(codeGraphOpenSearchEncryptionPolicy);
    codeGraphOpenSearchDomain.addDependency(codeGraphOpenSearchNetworkPolicy);


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
    createCodeGraphLambdaFunction.addEnvironment('S3_ENDPOINT', ec2.GatewayVpcEndpointAwsService.S3.name);
    createCodeGraphLambdaFunction.addEnvironment('PRIVATE_BEDROCK_DNS', `bedrock-runtime.${this.region}.amazonaws.com`);
    createCodeGraphLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_DNS', neptuneCluster.attrEndpoint);
    createCodeGraphLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_PORT', neptuneCluster.attrPort);

    const searchCodeGraphLambdaFunction = new lambda.Function(this, 'SearchCodeGraphFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset('./lambda/searchCodeGraph'),
      handler: 'index.handler',
      role: seachCodeGraphLambdaRole,
      timeout: cdk.Duration.seconds(10),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });
    searchCodeGraphLambdaFunction.addEnvironment('S3_ENDPOINT', ec2.GatewayVpcEndpointAwsService.S3.name);
    searchCodeGraphLambdaFunction.addEnvironment('PRIVATE_BEDROCK_DNS', `bedrock-runtime.${this.region}.amazonaws.com`);
    searchCodeGraphLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_DNS', neptuneCluster.attrReadEndpoint);
    searchCodeGraphLambdaFunction.addEnvironment('PRIVATE_NEPTUNE_PORT', neptuneCluster.attrPort);

    // Define the API Gateway
    const api = new apigateway.LambdaRestApi(this, 'CodeGraphApi', {
      handler: createCodeGraphLambdaFunction,
      proxy: false,
    });

    const createCodeGraphResource = api.root.addResource('createCodeGraph');
    createCodeGraphResource.addMethod('POST', new apigateway.LambdaIntegration(createCodeGraphLambdaFunction));

    const searchCodeGraphResource = api.root.addResource('searchCodeGraph');
    searchCodeGraphResource.addMethod('GET', new apigateway.LambdaIntegration(searchCodeGraphLambdaFunction));
  }
}
