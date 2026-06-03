'use strict';

/**
 * AI provider registry.
 *
 * Each provider is a descriptor module exposing:
 *   { id, label, keyPrefix, keyHint, promptFormat, usesServerCredentials,
 *     isAvailable(): boolean,
 *     customize({ resumeText, jobDescription, apiKey, type }): Promise<string> }
 *
 * Adding a provider is a single new file under ./providers + one line here.
 */

const openai = require('./providers/openai');
const gemini = require('./providers/gemini');
const claude = require('./providers/claude');

// Bedrock pulls in the AWS SDK; if that dependency is missing we degrade
// gracefully rather than crashing the whole service.
let bedrock = null;
try {
    bedrock = require('./providers/bedrock');
} catch (err) {
    bedrock = null;
}

const ALL = [openai, gemini, claude, ...(bedrock ? [bedrock] : [])];
const byId = new Map(ALL.map((p) => [p.id, p]));

function getProvider(id) {
    return byId.get(id) || null;
}

function listProviders() {
    return ALL.slice();
}

/** Providers usable right now (e.g. Bedrock only when AWS is configured). */
function availableProviders() {
    return ALL.filter((p) => p.isAvailable());
}

/**
 * Validates a user-supplied key for the given provider id.
 * Returns null when valid, or a human-readable error string.
 */
function validateKey(id, apiKey) {
    const provider = getProvider(id);
    if (!provider) return 'Invalid provider';
    if (provider.usesServerCredentials) return null; // no user key required

    const trimmed = (apiKey || '').trim();
    if (!trimmed) return 'API key is required';
    if (provider.keyPrefix && !trimmed.startsWith(provider.keyPrefix)) {
        return `${provider.label} keys must start with "${provider.keyPrefix}"`;
    }
    return null;
}

/** Serializable provider list for the frontend (no functions). */
function describeProviders() {
    return ALL.map((p) => ({
        id: p.id,
        label: p.label,
        keyHint: p.keyHint,
        usesServerCredentials: p.usesServerCredentials,
        available: p.isAvailable(),
    }));
}

module.exports = {
    getProvider,
    listProviders,
    availableProviders,
    validateKey,
    describeProviders,
};
