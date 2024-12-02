const { Client } = require('@opensearch-project/opensearch');
const { AwsSigv4Signer } = require('@opensearch-project/opensearch/aws');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');


require('dotenv').config();
const host = `https://${process.env.OPENSEARCH_DNS}`;
const region = process.env.REGION;

let client = null;

async function initClient() {
    if (!client) {
        const credentials = await defaultProvider()();

        client = new Client({
            ...AwsSigv4Signer({
                region: region,
                service: 'es',
                credentials,
            }),
            node: host,
        });
    }
}



async function deleteIndex(indexName) {
    await initClient();

    try {
        const { body: indexExists } = await client.indices.exists({ index: indexName });
        if (indexExists) {
            await client.indices.delete({ index: indexName });
            console.log(`Index ${indexName} deleted successfully`);
        } else {
            console.log(`Index ${indexName} does not exist`);
        }
    } catch (error) {
        console.error(`An error occurred while deleting the index: ${error}`);
    }
}


module.exports = {
    deleteIndex
};