'use strict';

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const config = require('../../../config');
const { createPrompt } = require('../prompts');
const logger = require('../../../utils/logger');

/**
 * Amazon Bedrock (Nova) provider descriptor.
 *
 * Ported from the retired Go/Lambda service (internal/ai/bedrock.go). Unlike the
 * other providers it authenticates with *server-side* AWS credentials rather
 * than a user-supplied key, so `usesServerCredentials` is true and it is only
 * offered when the server is configured for AWS.
 *
 * Transient-error retry/backoff is delegated to the AWS SDK v3 retry strategy
 * (configured via `maxAttempts`), which applies exponential backoff with jitter
 * to throttling and 5xx responses — the idiomatic equivalent of the hand-rolled
 * invokeWithRetry loop in the Go original.
 */

const SYSTEM_PROMPT =
    'You are an expert resume and cover-letter writer. Follow the requested output ' +
    'format markers exactly and output only the formatted content with no preamble, ' +
    'explanation, or trailing commentary.';

let client = null;

function getClient() {
    if (!client) {
        client = new BedrockRuntimeClient({
            region: config.providers.bedrock.region,
            maxAttempts: config.providers.bedrock.maxAttempts,
        });
    }
    return client;
}

/** Test hook: inject a fake client exposing `send`. */
function setClientForTest(fake) {
    client = fake;
}

/**
 * Returns true when the process looks configured to call AWS — explicit opt-in,
 * static keys, a named profile, or an ambient role (Lambda / ECS / EKS / EC2).
 */
function hasAwsCredentials() {
    if (process.env.BEDROCK_ENABLED === 'true') return true;
    if (process.env.BEDROCK_ENABLED === 'false') return false;
    return Boolean(
        process.env.AWS_ACCESS_KEY_ID ||
            process.env.AWS_PROFILE ||
            process.env.AWS_LAMBDA_FUNCTION_NAME ||
            process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
            process.env.AWS_WEB_IDENTITY_TOKEN_FILE ||
            process.env.AWS_ROLE_ARN
    );
}

/**
 * Invokes the Nova model with a single user prompt and returns its text.
 *
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function generateContent(prompt) {
    const { model, maxTokens, temperature, topP } = config.providers.bedrock;
    const start = Date.now();

    const request = {
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        system: [{ text: SYSTEM_PROMPT }],
        inferenceConfig: { maxTokens, temperature, topP },
    };

    const response = await getClient().send(
        new InvokeModelCommand({
            modelId: model,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(request),
        })
    );

    let decoded;
    try {
        decoded = JSON.parse(Buffer.from(response.body).toString('utf-8'));
    } catch (err) {
        throw new Error(`error decoding Nova response: ${err.message}`);
    }

    const text = decoded?.output?.message?.content?.[0]?.text;
    if (typeof text !== 'string' || text.length === 0) {
        throw new Error('no content in Nova response');
    }

    logger.info('Bedrock invocation complete', {
        model,
        duration_ms: Date.now() - start,
        input_tokens: decoded?.usage?.inputTokens,
        output_tokens: decoded?.usage?.outputTokens,
    });

    return text;
}

module.exports = {
    id: 'bedrock',
    label: 'Amazon Bedrock (Nova)',
    keyPrefix: null,
    keyHint: null,
    promptFormat: 'plain',
    usesServerCredentials: true,
    isAvailable: hasAwsCredentials,

    async customize({ resumeText, jobDescription, type }) {
        const prompt = createPrompt(type, resumeText, jobDescription, this.promptFormat);
        try {
            return await generateContent(prompt);
        } catch (error) {
            logger.error('Bedrock API error', { error });
            throw new Error(`Bedrock API error: ${error.message}`);
        }
    },

    // Test hooks
    __setClientForTest: setClientForTest,
    __generateContent: generateContent,
    __hasAwsCredentials: hasAwsCredentials,
};
