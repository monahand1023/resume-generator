'use strict';

const crypto = require('crypto');
const config = require('../../config');

/**
 * In-memory result cache. Keyed by a hash of (provider, jobUrl, resume bytes) so
 * re-running the exact same request reuses the prior result instead of
 * re-scraping and re-spending AI tokens.
 *
 * Deliberately in-memory (not SQLite) so resume-derived content is never written
 * to disk, consistent with the app's "processed in memory" privacy stance.
 * Entries expire after a TTL; the store is bounded with simple FIFO eviction.
 */
const store = new Map(); // key -> { result, expires }

/**
 * @param {string} provider
 * @param {string} jobUrl
 * @param {Buffer} resumeBuffer
 * @returns {string} sha256 hex digest
 */
function keyFor(provider, jobUrl, resumeBuffer) {
    const h = crypto.createHash('sha256');
    h.update(String(provider));
    h.update('\n');
    h.update(String(jobUrl));
    h.update('\n');
    h.update(resumeBuffer);
    return h.digest('hex');
}

/** Returns the cached result for key, or null if absent/expired. */
function get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expires < Date.now()) {
        store.delete(key);
        return null;
    }
    return entry.result;
}

/** Stores result under key with the configured TTL, evicting oldest if full. */
function set(key, result) {
    if (store.size >= config.cache.maxEntries && !store.has(key)) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
    }
    store.set(key, { result, expires: Date.now() + config.cache.ttlMs });
}

/** Removes all entries (used by tests). */
function clear() {
    store.clear();
}

module.exports = { keyFor, get, set, clear };
