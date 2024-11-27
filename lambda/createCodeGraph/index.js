const { invokeCommand, invokeTitanEmbedding } = require('./bedrock/invoke');

async function handler(event, context) {
    try {
        
        const result = await invokeTitanEmbedding('hello');
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({
                message: 'Code Graph Search Create function.',
                embedding: result
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