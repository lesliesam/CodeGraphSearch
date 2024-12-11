# Code Graph Search: Analyze and Query Code Repositories with AI

Code Graph Search is an advanced tool that leverages AI to analyze, index, and query code repositories. It creates a searchable graph representation of code structures, enabling developers to explore and understand complex codebases efficiently.

This project combines several AWS services, including Lambda, Neptune, OpenSearch, and Bedrock, to process code repositories, generate metadata, and provide powerful search capabilities. The system is designed to handle large-scale code analysis tasks and offer semantic code search functionality.

## Repository Structure

```
.
├── bin
│   └── code_graph_search.ts
├── client
│   ├── src
│   │   ├── App.vue
│   │   ├── components
│   │   ├── main.js
│   │   └── views
│   └── vue.config.js
├── lambda
│   ├── awslibs
│   │   ├── s3.js
│   │   └── sqs.js
│   ├── codeDownloader
│   │   └── index.js
│   ├── codeReader
│   │   └── index.js
│   ├── codeSummarizer
│   │   └── index.js
│   ├── graphSearchManagement
│   │   └── index.js
│   ├── libs
│   │   ├── bedrock
│   │   ├── constants.js
│   │   ├── embedding
│   │   ├── neptune
│   │   ├── opensearch
│   │   └── repositoryReader.js
│   └── searchCodeGraph
│       └── index.js
├── lib
│   └── code_graph_search-stack.ts
└── test
    └── code_graph_search.test.ts
```

### Key Files

- `bin/code_graph_search.ts`: Entry point for the CDK application
- `lib/code_graph_search-stack.ts`: Defines the AWS infrastructure stack
- `lambda/`: Contains Lambda functions for various processing steps
- `client/`: Vue.js frontend application

### Important Integration Points

- Neptune: Graph database for storing code structure
- OpenSearch: For semantic code search capabilities
- Bedrock: AI model integration for code analysis
- S3: Storage for code repositories and processed data
- SQS: Message queues for coordinating processing steps

## Usage Instructions

### Installation

Prerequisites:
- Node.js v22.x
- AWS CDK v2.x
- AWS CLI configured with appropriate permissions

Steps:
1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Install Lambda dependencies:
   ```
   node scripts/install-lambda-deps.js
   ```

### Getting Started

1. Deploy the infrastructure:
   ```
   npm run deploy
   ```

2. After deployment, note the CloudFront URL output for accessing the web interface.

3. Use the web interface to submit a Git repository URL for analysis.

### Configuration Options

- Environment variables in `cdk.json` for customizing deployment
- Lambda function configurations in `lib/code_graph_search-stack.ts`

### Common Use Cases

1. Analyzing a new code repository:
   - Submit the Git URL through the web interface
   - The system will download, process, and index the code

2. Searching the code graph:
   - Use the search functionality in the web interface
   - Enter natural language queries to find relevant code sections

3. Exploring code relationships:
   - Navigate through the graph visualization to understand code dependencies

### Testing & Quality

Run unit tests:
```
npm test
```

### Troubleshooting

1. Issue: Lambda function timeouts
   - Problem: Processing large repositories exceeds Lambda execution time
   - Solution: 
     1. Increase Lambda timeout in `lib/code_graph_search-stack.ts`
     2. Check CloudWatch logs for specific function failures
     3. Consider breaking down processing into smaller chunks

2. Issue: Neptune connection failures
   - Problem: Lambda functions unable to connect to Neptune cluster
   - Diagnostic steps:
     1. Verify VPC and security group configurations
     2. Check Neptune cluster status in AWS console
     3. Ensure Lambda functions have proper IAM permissions
   - Solution:
     - Update security group rules if necessary
     - Restart Neptune cluster if unresponsive

3. Issue: OpenSearch index not updating
   - Problem: Processed code metadata not appearing in search results
   - Debugging:
     1. Enable verbose logging in `lambda/libs/embedding/codeMetaRag.js`
     2. Check CloudWatch logs for indexing errors
     3. Verify OpenSearch cluster health
   - Solution:
     - Manually trigger reindexing through the management API if necessary

### Performance Optimization

- Monitor Lambda execution times and memory usage
- Use AWS X-Ray for tracing request flows through the system
- Optimize Neptune queries in `lambda/libs/neptune/` modules
- Adjust OpenSearch index settings for faster search performance

## Data Flow

The Code Graph Search system processes code repositories through several stages:

1. Repository Download: The `codeDownloader` Lambda function fetches the repository from the provided Git URL and stores it in S3.

2. Code Reading: The `codeReader` Lambda function analyzes the downloaded code, extracting structural information and metadata.

3. Code Summarization: The `codeSummarizer` Lambda function generates summaries for classes and functions using AI models via Bedrock.

4. Graph Population: Processed data is used to populate the Neptune graph database, creating nodes for classes, functions, and their relationships.

5. Search Indexing: Metadata and summaries are indexed in OpenSearch for efficient querying.

6. Query Processing: User queries are processed by the `searchCodeGraph` Lambda function, which combines graph traversal and semantic search to find relevant code sections.

```
[Git Repository] -> [codeDownloader] -> [S3] -> [codeReader] -> [codeSummarizer]
                                                    |                |
                                                    v                v
                                                [Neptune]    [OpenSearch]
                                                    ^                ^
                                                    |                |
                                    [searchCodeGraph] <---- [User Query]
```

## Deployment

Prerequisites:
- AWS Account with appropriate permissions
- AWS CDK installed and configured

Steps:
1. Configure AWS credentials:
   ```
   aws configure
   ```

2. Deploy the stack:
   ```
   npm run deploy
   ```

3. Note the outputs, including the CloudFront distribution URL for the web interface.

## Infrastructure

The Code Graph Search infrastructure is defined using AWS CDK in TypeScript. Key resources include:

- VPC:
  - Private subnets for Lambda functions and databases
  - VPC Endpoints for S3, Bedrock, and SQS

- Lambda:
  - codeDownloaderFunction: Downloads code from Git repositories
  - codeReaderFunction: Analyzes code structure
  - codeSummarizerFunction: Generates code summaries
  - searchCodeGraphFunction: Processes search queries

- Neptune:
  - NeptuneCluster: Stores the code graph structure
  - NeptuneInstance: Database instance for query processing

- OpenSearch:
  - OpenSearchDomain: Indexes code metadata for semantic search

- S3:
  - codeDownloadBucket: Stores downloaded code repositories
  - clientWebsiteBucket: Hosts the frontend application

- CloudFront:
  - Distribution: Serves the frontend application

- SQS:
  - codeDownloadQueue: Coordinates code download tasks
  - codeReaderQueue: Manages code analysis tasks

- IAM:
  - Roles and policies for Lambda functions and service integrations