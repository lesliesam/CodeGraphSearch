const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

const { scanRepository } = require('libs/repositoryReader');
const { processCodeMeta } = require('libs/neptune/loadCode');
const { generateClassSummary, generatePathSummary } = require('libs/embedding/summarize');
const path = require('path');
const fs = require('fs');
const { findFiles } = require('libs/utils/utils');
let { BEDROCK_API_PAUSE_TIME } = require('libs/constants');

require('dotenv').config();
const s3Client = new S3Client({
    // endpoint: `https://${process.env.S3_ENDPOINT}`
});
const bucketName = `${process.env.S3_BUCKET_NAME}`;

async function downloadS3Files(bucketName, folderPath, localPath) {
    const listParams = {
        Bucket: bucketName,
        Prefix: folderPath,
    };

    const listObjectsCommand = new ListObjectsV2Command(listParams);
    const listResponse = await s3Client.send(listObjectsCommand);

    if (!listResponse.Contents) {
        console.log(`No objects found in ${bucketName}/${folderPath}`);
        return;
    }

    for (const object of listResponse.Contents) {
        const objectKey = object.Key;
        const downloadPath = path.join(localPath, objectKey.replace(folderPath, ""));

        const getObjectParams = {
            Bucket: bucketName,
            Key: objectKey,
        };

        const getObjectCommand = new GetObjectCommand(getObjectParams);
        const response = await s3Client.send(getObjectCommand);

        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        const fileStream = fs.createWriteStream(downloadPath);
        response.Body.pipe(fileStream);
    }
}

async function processCodeSource(codePathRoot, subFolder, bedrockAPIPauseTime) {
    let localFolder = `/tmp/${codePathRoot}`;
    // Download the whole repository to local.
    await downloadS3Files(bucketName, codePathRoot, localFolder);

    if (subFolder && subFolder.length > 0) {
        localFolder += `/${subFolder}`;
    }
    if (bedrockAPIPauseTime) {
        BEDROCK_API_PAUSE_TIME = bedrockAPIPauseTime;
    }
    
    // Use LLM to parse the file structure
    const resFolder = await scanRepository(localFolder);
    // Save the file structure to Neptune
    await processCodeMeta(resFolder);
    // Summarize the Class description and upload to Neptune and Opensearch
    await generateClassSummary(resFolder);
    // Summarize the Path description and upload to Neptune and Opensearch
    await generatePathSummary(localFolder);
}

async function handler(event, context) {
    console.log(`event: ${JSON.stringify(event)}, context: ${JSON.stringify(context)}`);
    try {
        const messageBody = event.Records[0].body;
        if (messageBody) {
            const { codePathRoot, subFolder, bedrockAPIPauseTime } = JSON.parse(messageBody);

            await processCodeSource(codePathRoot, subFolder, bedrockAPIPauseTime);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

exports.handler = handler;