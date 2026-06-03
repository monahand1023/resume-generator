'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../../../config');
const { createPrompt } = require('../prompts');
const logger = require('../../../utils/logger');

/**
 * Anthropic Claude provider descriptor. Uses the official SDK, which is given a
 * per-request timeout matching the shared AI timeout budget.
 */
module.exports = {
    id: 'claude',
    label: 'Anthropic Claude',
    keyPrefix: 'sk-ant-',
    keyHint: 'sk-ant-...',
    promptFormat: 'plain',
    usesServerCredentials: false,
    isAvailable: () => true,

    async customize({ resumeText, jobDescription, apiKey, type }) {
        const { model, maxTokens } = config.providers.claude;
        const prompt = createPrompt(type, resumeText, jobDescription, this.promptFormat);
        const anthropic = new Anthropic({ apiKey, timeout: config.aiTimeoutMs });

        try {
            const message = await anthropic.messages.create({
                model,
                max_tokens: maxTokens,
                messages: [{ role: 'user', content: prompt }],
            });
            const content = message?.content?.[0]?.text;
            if (typeof content !== 'string') {
                throw new Error('Claude returned an unexpected response structure.');
            }
            return content;
        } catch (error) {
            logger.error('Claude API error', { error });
            throw new Error(`Claude API error: ${error.message}`);
        }
    },
};
