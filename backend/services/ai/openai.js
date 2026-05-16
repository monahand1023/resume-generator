'use strict';

const { createPrompt } = require('./prompts');

/**
 * Customizes resume/cover-letter content using OpenAI GPT-4.
 *
 * @param {string} resumeText
 * @param {string} jobDescription
 * @param {string} apiKey
 * @param {'resume'|'cover_letter'|'changes'} type
 * @returns {Promise<string>}
 */
async function customizeWithOpenAI(resumeText, jobDescription, apiKey, type) {
    const prompt = createPrompt(type, resumeText, jobDescription, 'plain');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2000,
            temperature: 0.7,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

module.exports = { customizeWithOpenAI };
