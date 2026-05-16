'use strict';

const { createPrompt } = require('./prompts');

const MODEL_NAME = 'gemini-1.5-pro-latest';

/**
 * Customizes resume/cover-letter content using Google Gemini.
 *
 * @param {string} resumeText
 * @param {string} jobDescription
 * @param {string} apiKey
 * @param {'resume'|'cover_letter'|'changes'} type
 * @returns {Promise<string>}
 */
async function customizeWithGemini(resumeText, jobDescription, apiKey, type) {
    const prompt = createPrompt(type, resumeText, jobDescription, 'markdown');
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 8000 },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            ],
        }),
    });

    if (!response.ok) {
        let errorDetails = `Status: ${response.status}, StatusText: ${response.statusText}`;
        try {
            const errorData = await response.json();
            errorDetails += `, Response: ${JSON.stringify(errorData)}`;
        } catch (_e) {
            errorDetails += `, Response (raw): ${await response.text()}`;
        }
        console.error('Gemini API Error:', errorDetails);
        const err = new Error(`Gemini API request failed. ${errorDetails}`);
        err.status = response.status;
        throw err;
    }

    const data = await response.json();

    if (
        data.candidates &&
        data.candidates.length > 0 &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.length > 0 &&
        typeof data.candidates[0].content.parts[0].text === 'string'
    ) {
        return data.candidates[0].content.parts[0].text;
    }

    if (data.promptFeedback && data.promptFeedback.blockReason) {
        const { blockReason, safetyRatings } = data.promptFeedback;
        console.error(`Gemini content blocked. Reason: ${blockReason}, Ratings: ${JSON.stringify(safetyRatings || [])}`);
        throw new Error(
            `Your request was blocked by Gemini's safety filters. Reason: ${blockReason}. Please revise your input or check safety settings.`
        );
    }

    console.warn('Gemini response structure unexpected:', JSON.stringify(data));
    throw new Error('Gemini API returned an unexpected, empty, or improperly formatted response structure.');
}

module.exports = { customizeWithGemini };
