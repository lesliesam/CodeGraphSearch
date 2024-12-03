

const { scanRepository } = require('libs/repositoryReader');
const { uploadFolderToS3, downloadS3Files, CODE_SOURCE_BUCKET_PREFIX, CODE_PROCRESS_BUCKET_PREFIX } = require('awslibs/s3');
const { invokeSQS } = require('awslibs/sqs');
const { setBedrockAPIPauseTime  } = require('libs/constants');

require('dotenv').config();
const bucketName = `${process.env.S3_BUCKET_NAME}`;
const queueUrl = process.env.CODE_READER_QUEUE_URL;

async function processCodeSource(uuid, subFolder, bedrockAPIPauseTime) {
    let localFolder = `/tmp/${uuid}`;
    // Download the whole repository to local.
    await downloadS3Files(bucketName, `${CODE_SOURCE_BUCKET_PREFIX}/${uuid}`, localFolder);

    if (subFolder && subFolder.length > 0) {
        localFolder += `/${subFolder}`;
    }
    if (bedrockAPIPauseTime) {
        setBedrockAPIPauseTime(bedrockAPIPauseTime);
    }
    
    // Use LLM to parse the file structure
    const resFolder = await scanRepository(localFolder);

    await uploadFolderToS3(bucketName, resFolder, `${CODE_PROCRESS_BUCKET_PREFIX}/${uuid}`)
}

async function handler(event, context) {
    console.log(`event: ${JSON.stringify(event)}, context: ${JSON.stringify(context)}`);
    try {
        const messageBody = event.Records[0].body;
        if (messageBody) {
            const { uuid, subFolder, bedrockAPIPauseTime } = JSON.parse(messageBody);

            await processCodeSource(uuid, subFolder, bedrockAPIPauseTime);

            const sendMessageResult = await invokeSQS(queueUrl, {
                uuid,
                subFolder,
                bedrockAPIPauseTime
            });
            console.log('Message sent to SQS:', sendMessageResult);
        }
    } catch (error) {
        console.error('Error:', error); 
    }
}

exports.handler = handler;