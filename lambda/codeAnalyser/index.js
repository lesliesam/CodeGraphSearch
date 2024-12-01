


async function handler(event, context) {
    try {
        
        console.log(`event: ${JSON.stringify(event)}, context: ${JSON.stringify(context)}`);

        
    } catch (error) {
        console.error('Error:', error);
    }
}

exports.handler = handler;