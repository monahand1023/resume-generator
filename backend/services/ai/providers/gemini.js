'use strict';

const config = require('../../../config');
const { createPrompt } = require('../prompts');
const { postJSON } = require('../http');
const logger = require('../../../utils/logger');

/**
 * Google Gemini provider descriptor.
 *
 * The API key is sent in the `x-goog-api-key` header (not the URL query string)
 * so it cannot leak via access logs or browser history.
 */
module.exports = {
    id: 'gemini',
    label: 'Google Gemini',
    keyPrefix: 'AIza',
    keyHint: 'AIza...',
    promptFormat: 'markdown',
    usesServerCredentials: false,
    isAvailable: () => true,

    async customize({ resumeText, jobDescription, apiKey, type }) {
        const { model, maxTokens, temperature } = config.providers.gemini;
        const prompt = createPrompt(type, resumeText, jobDescription, this.promptFormat);
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const response = await postJSON(apiUrl, {
            headers: { 'x-goog-api-key': apiKey },
            body: {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature, maxOutputTokens: maxTokens },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                ],
            },
        });

        if (!response.ok) {
            let errorDetails = `Status: ${response.status}, StatusText: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorDetails += `, Response: ${JSON.stringify(errorData)}`;
            } catch (_e) {
                errorDetails += `, Response (raw): ${await response.text()}`;
            }
            logger.error('Gemini API error', { status: response.status });
            const err = new Error(`Gemini API request failed. ${errorDetails}`);
            err.status = response.status;
            throw err;
        }

        const data = await response.json();

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text === 'string') {
            return text;
        }

        if (data.promptFeedback && data.promptFeedback.blockReason) {
            const { blockReason } = data.promptFeedback;
            logger.warn('Gemini content blocked', { blockReason });
            throw new Error(
                `Your request was blocked by Gemini's safety filters. Reason: ${blockReason}. Please revise your input or check safety settings.`
            );
        }

        logger.warn('Gemini response structure unexpected');
        throw new Error('Gemini API returned an unexpected, empty, or improperly formatted response structure.');
    },
};
