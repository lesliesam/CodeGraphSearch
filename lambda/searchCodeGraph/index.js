const { getFunctionCaller, getFunctionCallee } = require('libs/neptune/readWithCypher');
const { semanticSearch } = require('libs/opensearch/codeMetaRag');
const { invokeEmbedding } = require('libs/bedrock/runtime');

const { FUNC_META_DATA } = require('libs/constants');

async function handler(event, context) {
    try {
        const { httpMethod, queryStringParameters } = event;
        let responseBody;
        if (httpMethod === 'GET') {
            const command = queryStringParameters.command;
            switch (command) {
                case 'pathSummary':
                    responseBody = 'In development...';
                    break;
                case 'queryGraph':
                    const index_name = queryStringParameters.index;
                    const queryContent = queryStringParameters.query;
                    console.log(`index_name: ${index_name}, queryContent: ${queryContent}`);

                    const vector = await invokeEmbedding(queryContent);
                    const results = await semanticSearch(index_name, vector, 5);

                    console.log(`results: ${JSON.stringify(results, null, 2)}`);
                    if (index_name === FUNC_META_DATA) {
                        for (const result of results) {
                            result.caller = await getFunctionCaller(result._source.path, result._source.name);
                            result.callto = await getFunctionCallee(result._source.path, result._source.name);
                        }
                    }
                    responseBody = results;
                    break;
                default:
                    responseBody = 'Unsupported command';
            }
        } else {
            throw new Error('Invalid HTTP method');
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({
                responseBody
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