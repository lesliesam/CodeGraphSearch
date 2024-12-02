const { deleteAll } = require('libs/neptune/clear');
const { deleteIndex } = require('libs/embedding/codeMetaRag');
const {
    PATH_META_DATA,
    CLASS_META_DATA,
    FUNC_META_DATA,
} = require('libs/constants');


async function handler(event, context) {
    try {
        const { httpMethod, queryStringParameters } = event;
        if (httpMethod === 'POST') {
            const command = queryStringParameters.command;

            if (!command || command.length === 0) {
                throw new Error('Missing commmand parameter.');
            }

            if (command === 'clearAll') {
                await deleteAll();
                await deleteIndex(PATH_META_DATA);
                await deleteIndex(CLASS_META_DATA);
                await deleteIndex(FUNC_META_DATA);

            } else if (command === 'clearGraphDB') {
                await deleteAll();

            } else if (command === 'removeIndex') {
                const indexName = queryStringParameters.indexName;
                if (!indexName || indexName.length === 0) {
                    throw new Error('Missing required parameters removing index.');
                }
                await deleteIndex(indexName);

            }

        } else {
            throw new Error('Invalid HTTP method');
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({
                message: 'Operation succeed.'
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