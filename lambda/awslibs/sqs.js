const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

async function invokeSQS(queueUrl, message) {
    const sqsClient = new SQSClient();
    const sendMessageResult = await sqsClient.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message)
    }));

    return sendMessageResult;
}

module.exports = { invokeSQS };