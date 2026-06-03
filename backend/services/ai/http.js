'use strict';

const config = require('../../config');

/**
 * POSTs JSON with an enforced timeout. Returns the raw `fetch` Response so the
 * caller can interpret provider-specific success/error bodies. Network failures
 * and timeouts are normalized into Errors with a stable `.code`.
 *
 * @param {string} url
 * @param {{ headers?: object, body?: object|string, timeoutMs?: number }} opts
 * @returns {Promise<Response>}
 */
async function postJSON(url, { headers = {}, body, timeoutMs = config.aiTimeoutMs } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const host = (() => {
        try {
            return new URL(url).host;
        } catch {
            return url;
        }
    })();

    try {
        return await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: typeof body === 'string' ? body : JSON.stringify(body),
            signal: controller.signal,
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            const e = new Error(`Request to ${host} timed out after ${timeoutMs}ms`);
            e.code = 'AI_TIMEOUT';
            throw e;
        }
        const e = new Error(`Network error contacting ${host}: ${err.message}`);
        e.code = 'AI_NETWORK';
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { postJSON };
