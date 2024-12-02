
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const gitDownloader = require('download-git-repo');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const s3Client = new S3Client();
const bucketName = `${process.env.S3_BUCKET_NAME}`;
const queueUrl = process.env.CODE_DOWNLOAD_QUEUE_URL;


function getRepositoryDetails(gitUrl) {
    // Remove the protocol part (e.g., https://) and the .git extension
    const cleanedUrl = gitUrl.replace(/^https?:\/\/|\.git$/g, '');

    const urlParts = cleanedUrl.split('/');
    const repositoryOwner = urlParts[1];
    const repositoryName = urlParts[2];

    return { repositoryOwner, repositoryName };
}

async function downloadCode(gitUrl, branch) {
    console.log(`Downloading code from repository: ${gitUrl} and branch: ${branch}`);
    const { repositoryOwner, repositoryName } = getRepositoryDetails(gitUrl);
    const gitUrlWithBranch = `${repositoryOwner}/${repositoryName}#${branch}`;

    const tmpDir = '/tmp';
    const uuid = uuidv4();
    const downloadDir = path.join(tmpDir, uuid);

    return new Promise((resolve, reject) => {
        gitDownloader(gitUrlWithBranch, downloadDir, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve({ downloadDir, uuid });
            }
        });
    })
}

async function invokeSQS(queueUrl, message) {
    const sqsClient = new SQSClient();
    const sendMessageResult = await sqsClient.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message)
    }));

    return sendMessageResult;
}

async function uploadFolder(folderPath, bucketPrefix = '') {
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            await uploadFolder(filePath, path.join(bucketPrefix, file));
        } else {
            const fileStream = fs.createReadStream(filePath);
            const key = path.join(bucketPrefix, file);

            const uploadParams = {
                Bucket: bucketName,
                Body: fileStream,
                Key: key,
            };

            try {
                const data = await s3Client.send(new PutObjectCommand(uploadParams));
                console.log(`File uploaded successfully. ${file}`);
            } catch (err) {
                console.log('Error', err);
            }
        }
    }
}

async function handler(event, context) {
    try {
        const { httpMethod, queryStringParameters } = event;
        if (httpMethod === 'POST') {
            const gitUrl = queryStringParameters.gitUrl;
            const branch = queryStringParameters.branch;

            if (!gitUrl || !branch || gitUrl.length === 0 || branch.length === 0) {
                throw new Error('Missing required parameters');
            }

            const subFolder = queryStringParameters.subFolder;
            const bedrockAPIPauseTime = queryStringParameters.bedrockAPIPauseTime;

            const { downloadDir, uuid } = await downloadCode(gitUrl, branch);
            await uploadFolder(downloadDir, uuid);
            const sendMessageResult = await invokeSQS(queueUrl, {
                codePathRoot: uuid,
                subFolder,
                bedrockAPIPauseTime
            });
            console.log('Message sent to SQS:', sendMessageResult);

        } else {
            throw new Error('Invalid HTTP method');
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({
                message: 'Code Downloader succeed.'
            })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                message: 'Internal server error',
                error: error.message
            })
        };
    }
}

exports.handler = handler;


// async function download(gitUrl, branch) {
//     const { downloadDir, uuid } = await downloadCode(gitUrl, branch);
//     await uploadFolder(downloadDir, uuid);
// }
// download('https://github.com/yankils/hello-world.git', 'master');
