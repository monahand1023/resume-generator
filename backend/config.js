'use strict';

/**
 * Centralized configuration.
 *
 * Every tunable that used to be a scattered literal lives here, read from the
 * environment with a sensible default. Import the frozen `config` object rather
 * than reading `process.env` directly elsewhere.
 */

function intEnv(name, fallback) {
    const raw = process.env[name];
    if (raw == null || raw === '') return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function strEnv(name, fallback) {
    const raw = process.env[name];
    return raw == null || raw === '' ? fallback : raw;
}

const config = {
    port: intEnv('PORT', 3000),

    // CORS: comma-separated allowlist, or null to allow all (dev default).
    corsOrigins: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
        : null,

    // Upload limits (bytes).
    maxFileSizeBytes: intEnv('MAX_FILE_SIZE_BYTES', 10 * 1024 * 1024),

    // Input guards before an AI call (characters).
    maxResumeChars: intEnv('MAX_RESUME_CHARS', 50_000),
    maxJobUrlLength: intEnv('MAX_JOB_URL_LENGTH', 2_000),
    // Truncate the scraped job description before sending it to the model.
    jdMaxLength: intEnv('JD_MAX_LENGTH', 8_000),

    rateLimit: {
        global: {
            windowMs: intEnv('RATE_LIMIT_GLOBAL_WINDOW_MS', 15 * 60 * 1000),
            max: intEnv('RATE_LIMIT_GLOBAL_MAX', 100),
        },
        resume: {
            windowMs: intEnv('RATE_LIMIT_RESUME_WINDOW_MS', 60 * 60 * 1000),
            max: intEnv('RATE_LIMIT_RESUME_MAX', 10),
        },
        preview: {
            windowMs: intEnv('RATE_LIMIT_PREVIEW_WINDOW_MS', 60 * 60 * 1000),
            max: intEnv('RATE_LIMIT_PREVIEW_MAX', 30),
        },
    },

    // In-memory result cache: same resume+jobUrl+provider reuses the prior
    // result instead of re-spending AI tokens. In-memory (not on disk) to keep
    // resume content out of persistent storage.
    cache: {
        ttlMs: intEnv('RESULT_CACHE_TTL_MS', 24 * 60 * 60 * 1000),
        maxEntries: intEnv('RESULT_CACHE_MAX_ENTRIES', 50),
    },

    queue: {
        jobTtlMs: intEnv('JOB_TTL_MS', 60 * 60 * 1000),
        cleanupIntervalMs: intEnv('JOB_CLEANUP_INTERVAL_MS', 5 * 60 * 1000),
        streamTimeoutMs: intEnv('JOB_STREAM_TIMEOUT_MS', 120_000),
    },

    // Per-AI-call timeout (ms) applied via AbortController.
    aiTimeoutMs: intEnv('AI_TIMEOUT_MS', 60_000),

    // Job-scrape navigation timeout (ms).
    scrapeTimeoutMs: intEnv('SCRAPE_TIMEOUT_MS', 30_000),

    // Provider model + sampling config. Models are env-overridable so swapping a
    // model never requires a code change.
    providers: {
        openai: {
            model: strEnv('OPENAI_MODEL', 'gpt-4'),
            maxTokens: intEnv('OPENAI_MAX_TOKENS', 2_000),
            temperature: 0.7,
        },
        gemini: {
            model: strEnv('GEMINI_MODEL', 'gemini-1.5-pro-latest'),
            maxTokens: intEnv('GEMINI_MAX_TOKENS', 8_000),
            temperature: 0.4,
        },
        claude: {
            model: strEnv('CLAUDE_MODEL', 'claude-3-5-sonnet-20241022'),
            maxTokens: intEnv('CLAUDE_MAX_TOKENS', 3_000),
            temperature: 0.7,
        },
        bedrock: {
            region: strEnv('AWS_REGION', strEnv('BEDROCK_REGION', 'us-west-2')),
            model: strEnv('BEDROCK_MODEL_ID', 'us.amazon.nova-lite-v1:0'),
            maxTokens: intEnv('BEDROCK_MAX_TOKENS', 2_000),
            temperature: 0.1,
            topP: 0.9,
            maxAttempts: intEnv('BEDROCK_MAX_ATTEMPTS', 3),
        },
    },

    logLevel: strEnv('LOG_LEVEL', process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
};

module.exports = config;
