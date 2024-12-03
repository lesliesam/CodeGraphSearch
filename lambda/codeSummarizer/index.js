
const { downloadS3Files, CODE_SOURCE_BUCKET_PREFIX, CODE_PROCRESS_BUCKET_PREFIX } = require('awslibs/s3');
const { processCodeMeta } = require('libs/neptune/loadCode');
const { generateClassSummary, generatePathSummary } = require('libs/embedding/summarize');
const { setBedrockAPIPauseTime  } = require('libs/constants');

require('dotenv').config();
const bucketName = `${process.env.S3_BUCKET_NAME}`;

async function processCodeSource(uuid, subFolder, bedrockAPIPauseTime) {
    let localFolder = `/tmp/source/${uuid}`;
    const processFolder = `/tmp/process/${uuid}`;
    
    await downloadS3Files(bucketName, `${CODE_SOURCE_BUCKET_PREFIX}/${uuid}`, localFolder);
    await downloadS3Files(bucketName, `${CODE_PROCRESS_BUCKET_PREFIX}/${uuid}`, processFolder);

    if (subFolder && subFolder.length > 0) {
        localFolder += `/${subFolder}`;
    }
    if (bedrockAPIPauseTime) {
        setBedrockAPIPauseTime(bedrockAPIPauseTime);
    }
    
    // Save the file structure to Neptune
    await processCodeMeta(processFolder);
    // Summarize the Class description and upload to Neptune and Opensearch
    await generateClassSummary(processFolder);
    // Summarize the Path description and upload to Neptune and Opensearch
    await generatePathSummary(localFolder);
}

async function handler(event, context) {
    console.log(`event: ${JSON.stringify(event)}, context: ${JSON.stringify(context)}`);
    try {
        const messageBody = event.Records[0].body;
        if (messageBody) {
            const { uuid, subFolder, bedrockAPIPauseTime } = JSON.parse(messageBody);

            await processCodeSource(uuid, subFolder, bedrockAPIPauseTime);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

exports.handler = handler;