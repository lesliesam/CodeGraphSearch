const { listAll } = require('./neptune/listTop');
const { upsertClassMetaRag, semanticSearch } = require('./opensearch/codeMetaRag');
const { invokeTitanEmbedding } = require('./bedrock/invoke');

const { CLASS_META_DATA } = require('./constants');

async function handler(event, context) {
    try {
        
        const result = await listAll();
        await upsertClassMetaRag('ClassA', 'PathA', 'I like apple.');
        const vector = await invokeTitanEmbedding('I want to eat apple.');
        console.log(vector.length);
        const searchResult = await semanticSearch(CLASS_META_DATA, vector);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({
                message: 'Code Graph Search function.',
                embedding: result,
                searchResult
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