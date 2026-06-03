'use strict';

const config = require('../../../config');
const { createPrompt } = require('../prompts');
const { postJSON } = require('../http');

/**
 * OpenAI provider descriptor. See services/ai/index.js for the registry shape.
 */
module.exports = {
    id: 'openai',
    label: 'OpenAI GPT-4',
    keyPrefix: 'sk-',
    keyHint: 'sk-...',
    promptFormat: 'plain',
    usesServerCredentials: false,
    isAvailable: () => true,

    async customize({ resumeText, jobDescription, apiKey, type }) {
        const { model, maxTokens, temperature } = config.providers.openai;
        const prompt = createPrompt(type, resumeText, jobDescription, this.promptFormat);

        const response = await postJSON('https://api.openai.com/v1/chat/completions', {
            headers: { Authorization: `Bearer ${apiKey}` },
            body: {
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: maxTokens,
                temperature,
            },
        });

        if (!response.ok) {
            let detail = response.statusText;
            try {
                const data = await response.json();
                detail = data?.error?.message || detail;
            } catch {
                /* non-JSON error body — keep statusText */
            }
            throw new Error(`OpenAI API error: ${detail}`);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') {
            throw new Error('OpenAI returned an unexpected response structure.');
        }
        return content;
    },
};
