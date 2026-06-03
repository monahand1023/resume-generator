'use strict';

const config = require('../config');

/**
 * Minimal dependency-free structured logger. Emits one JSON object per line,
 * mirroring the shape produced by the Go service's slog handler:
 *
 *   {"time":"...","level":"info","msg":"...","<field>":<value>}
 *
 * Sensitive fields (anything that looks like an API key) are redacted before
 * serialization so credentials never reach stdout/CloudWatch.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

// Field names whose values must never be logged verbatim.
const SENSITIVE_KEYS = new Set(['apikey', 'api_key', 'key', 'authorization', 'password', 'secret', 'token']);

function redactValue(val) {
    if (typeof val !== 'string' || val.length === 0) return '[redacted]';
    // Keep a short prefix for debuggability, hide the rest.
    return `${val.slice(0, 4)}***`;
}

function sanitizeFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) {
        if (SENSITIVE_KEYS.has(k.toLowerCase())) {
            out[k] = redactValue(v);
        } else if (v instanceof Error) {
            out[k] = v.message;
        } else {
            out[k] = v;
        }
    }
    return out;
}

function emit(level, msg, fields = {}) {
    if (LEVELS[level] < threshold) return;
    const record = {
        time: new Date().toISOString(),
        level,
        msg,
        ...sanitizeFields(fields),
    };
    const line = JSON.stringify(record);
    if (level === 'error' || level === 'warn') {
        process.stderr.write(line + '\n');
    } else {
        process.stdout.write(line + '\n');
    }
}

const logger = {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    /** Returns a child logger that merges `base` fields into every record. */
    child(base) {
        return {
            debug: (msg, fields) => emit('debug', msg, { ...base, ...fields }),
            info: (msg, fields) => emit('info', msg, { ...base, ...fields }),
            warn: (msg, fields) => emit('warn', msg, { ...base, ...fields }),
            error: (msg, fields) => emit('error', msg, { ...base, ...fields }),
        };
    },
};

module.exports = logger;
