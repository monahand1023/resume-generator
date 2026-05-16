'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { createPrompt } = require('./prompts');

/**
 * Customizes resume/cover-letter content using Anthropic Claude.
 *
 * @param {string} resumeText
 * @param {string} jobDescription
 * @param {string} apiKey
 * @param {'resume'|'cover_letter'|'changes'} type
 * @returns {Promise<string>}
 */
async function customizeWithClaude(resumeText, jobDescription, apiKey, type) {
    const prompt = createPrompt(type, resumeText, jobDescription, 'plain');
    const anthropic = new Anthropic({ apiKey });

    try {
        const message = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 3000,
            messages: [{ role: 'user', content: prompt }],
        });
        return message.content[0].text;
    } catch (error) {
        console.error('Claude API Error:', error);
        throw new Error(`Claude API error: ${error.message}`);
    }
}

module.exports = { customizeWithClaude };
