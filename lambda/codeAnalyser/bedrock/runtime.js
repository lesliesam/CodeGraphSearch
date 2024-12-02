const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const { sleep } = require('../utils/utils');
const { BEDROCK_API_PAUSE_TIME } = require('../constants');

require('dotenv').config();
const client = new BedrockRuntimeClient({
    endpoint: `https://${process.env.PRIVATE_BEDROCK_DNS}`
});

async function invokeCommand(systemPrompt, messages) {
    const params = {
        modelId: "anthropic.claude-3-sonnet-20240229-v1:0", // Claude 3 Sonnet 模型
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 20000,
            system: systemPrompt,
            messages
        }),
    };

    try {
        const command = new InvokeModelCommand(params);
        const response = await client.send(command);

        // 解析响应
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));

        return responseBody.content[0].text;
    } catch (error) {
        console.error("Error invoking Bedrock:", error);
        throw error;
    }
}

async function invokeTitanEmbedding(message) {
    try {
        const command = new InvokeModelCommand({
            modelId: "amazon.titan-embed-text-v2:0",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
                inputText: message,
            })
        });
        const response = await client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        return responseBody.embedding;
    } catch (err) {
        console.error(err);
        console.error(err.stack);
    }
}

module.exports = { invokeCommand, invokeTitanEmbedding }