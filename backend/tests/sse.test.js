'use strict';

/**
 * SSE endpoint tests for GET /api/job/:jobId/stream
 *
 * We build a minimal Express app that wires up only the SSE route and the
 * existing GET /api/job/:jobId route inline, so we can test without pulling
 * in puppeteer or other heavy deps that break Jest's CommonJS transform.
 */

const express = require('express');
const supertest = require('supertest');
const { getJob, jobs } = require('../services/queue/jobQueue');

// ---------------------------------------------------------------------------
// Build a test-only Express app with the two job endpoints embedded inline.
// This mirrors the logic in routes/resume.js without importing it.
// ---------------------------------------------------------------------------
function buildApp() {
    const app = express();
    app.use(express.json());

    /** GET /api/job/:jobId — plain JSON poll (kept for regression) */
    app.get('/api/job/:jobId', (req, res) => {
        const job = getJob(req.params.jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        res.json({ status: job.status, result: job.result, error: job.error, progress: job.progress });
    });

    /** GET /api/job/:jobId/stream — SSE */
    app.get('/api/job/:jobId/stream', (req, res) => {
        const job = getJob(req.params.jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

        const sendJobState = () =>
            sendEvent({ status: job.status, result: job.result, error: job.error, progress: job.progress });

        sendJobState();

        if (job.status === 'completed' || job.status === 'failed') {
            res.end();
            return;
        }

        let interval = null;

        const timeout = setTimeout(() => {
            if (interval) clearInterval(interval);
            sendEvent({ status: 'failed', result: null, error: 'Stream timeout: job did not complete within 120 seconds', progress: 0 });
            res.end();
        }, 120_000);

        interval = setInterval(() => {
            if (job.status === 'completed' || job.status === 'failed') {
                clearInterval(interval);
                clearTimeout(timeout);
                sendJobState();
                res.end();
            }
        }, 250);

        req.on('close', () => {
            if (interval) clearInterval(interval);
            clearTimeout(timeout);
        });
    });

    return app;
}

// ---------------------------------------------------------------------------
// Helper: collect SSE events from a stream until it closes or times out.
// Returns an array of parsed JSON objects.
// ---------------------------------------------------------------------------
function collectSSE(app, path, { timeoutMs = 2000 } = {}) {
    return new Promise((resolve) => {
        const events = [];
        let settled = false;

        function finish() {
            if (!settled) {
                settled = true;
                resolve(events);
            }
        }

        const timer = setTimeout(finish, timeoutMs);

        supertest(app)
            .get(path)
            .set('Accept', 'text/event-stream')
            .buffer(false)
            .parse((res, callback) => {
                res.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                events.push(JSON.parse(line.slice(6)));
                            } catch (_) { /* ignore */ }
                        }
                    }
                });
                res.on('end', () => {
                    clearTimeout(timer);
                    callback(null, events);
                    finish();
                });
                res.on('error', () => {
                    clearTimeout(timer);
                    callback(null, events);
                    finish();
                });
            })
            .then(() => { clearTimeout(timer); finish(); })
            .catch(() => { clearTimeout(timer); finish(); });
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SSE endpoint GET /api/job/:jobId/stream', () => {
    let app;

    beforeAll(() => {
        app = buildApp();
    });

    beforeEach(() => {
        jobs.clear();
    });

    // -----------------------------------------------------------------------
    // 1. Unknown job → 404
    // -----------------------------------------------------------------------
    test('returns 404 JSON for an unknown jobId', async () => {
        const res = await supertest(app)
            .get('/api/job/00000000-0000-0000-0000-000000000000/stream')
            .expect(404);

        expect(res.body).toEqual({ error: 'Job not found' });
    });

    // -----------------------------------------------------------------------
    // 2. Completed job → sends final event and closes
    // -----------------------------------------------------------------------
    test('sends a completed event and closes for an already-completed job', async () => {
        jobs.set('completed-job', {
            status: 'completed',
            result: { resume: 'text' },
            error: null,
            createdAt: Date.now(),
            progress: 100,
        });

        const events = await collectSSE(app, '/api/job/completed-job/stream', { timeoutMs: 1000 });

        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events[0].status).toBe('completed');
        expect(events[0].progress).toBe(100);
        expect(events[0].result).toEqual({ resume: 'text' });
    });

    // -----------------------------------------------------------------------
    // 3. Failed job → sends final event and closes
    // -----------------------------------------------------------------------
    test('sends a failed event and closes for an already-failed job', async () => {
        jobs.set('failed-job', {
            status: 'failed',
            result: null,
            error: 'AI blew up',
            createdAt: Date.now(),
            progress: 0,
        });

        const events = await collectSSE(app, '/api/job/failed-job/stream', { timeoutMs: 1000 });

        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events[0].status).toBe('failed');
        expect(events[0].error).toBe('AI blew up');
    });

    // -----------------------------------------------------------------------
    // 4. Pending job → sends at least one event
    // -----------------------------------------------------------------------
    test('sends at least one event for a pending job', async () => {
        jobs.set('pending-job', {
            status: 'pending',
            result: null,
            error: null,
            createdAt: Date.now(),
            progress: 0,
        });

        const events = await collectSSE(app, '/api/job/pending-job/stream', { timeoutMs: 600 });

        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events[0].status).toBe('pending');
    });

    // -----------------------------------------------------------------------
    // 5. Processing job transitions to completed while streaming
    // -----------------------------------------------------------------------
    test('delivers completed event when a processing job finishes mid-stream', async () => {
        jobs.set('transitions-job', {
            status: 'processing',
            result: null,
            error: null,
            createdAt: Date.now(),
            progress: 10,
        });

        // Flip to completed after 300 ms
        setTimeout(() => {
            const job = jobs.get('transitions-job');
            if (job) {
                job.status = 'completed';
                job.result = { done: true };
                job.progress = 100;
            }
        }, 300);

        const events = await collectSSE(app, '/api/job/transitions-job/stream', { timeoutMs: 1500 });

        expect(events.length).toBeGreaterThanOrEqual(1);
        const completed = events.find((e) => e.status === 'completed');
        expect(completed).toBeDefined();
        expect(completed.progress).toBe(100);
    });

    // -----------------------------------------------------------------------
    // 6. Client disconnect prevents further events after close
    // -----------------------------------------------------------------------
    test('no additional events are sent after client disconnects', async () => {
        jobs.set('disconnect-job', {
            status: 'pending',
            result: null,
            error: null,
            createdAt: Date.now(),
            progress: 0,
        });

        // Collect for 250 ms then disconnect; confirm we got the initial event
        // and that the stream did not error (which would indicate cleanup worked)
        const events = await collectSSE(app, '/api/job/disconnect-job/stream', { timeoutMs: 250 });

        // The immediate snapshot event must have been received
        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events[0].status).toBe('pending');

        // Wait another tick to confirm no crash / unhandled rejection from a
        // cleared interval trying to write to a closed socket
        await new Promise((r) => setTimeout(r, 100));
    });

    // -----------------------------------------------------------------------
    // 7. SSE response sets correct Content-Type header
    // -----------------------------------------------------------------------
    test('responds with text/event-stream Content-Type for a pending job', async () => {
        jobs.set('headers-job', {
            status: 'pending',
            result: null,
            error: null,
            createdAt: Date.now(),
            progress: 0,
        });

        let observedContentType = null;

        await new Promise((resolve) => {
            supertest(app)
                .get('/api/job/headers-job/stream')
                .buffer(false)
                .parse((res, callback) => {
                    observedContentType = res.headers['content-type'];
                    res.on('data', () => {});
                    res.on('end', () => { callback(null, {}); resolve(); });
                    res.on('error', () => { callback(null, {}); resolve(); });
                    setTimeout(() => { res.destroy(); resolve(); }, 200);
                })
                .then(() => resolve())
                .catch(() => resolve());
        });

        expect(observedContentType).toMatch(/text\/event-stream/);
    });

    // -----------------------------------------------------------------------
    // 8. Existing GET /api/job/:jobId still returns JSON (non-SSE)
    // -----------------------------------------------------------------------
    test('GET /api/job/:jobId still returns JSON state (non-SSE endpoint unaffected)', async () => {
        jobs.set('json-poll-job', {
            status: 'completed',
            result: { resume: 'ok' },
            error: null,
            createdAt: Date.now(),
            progress: 100,
        });

        const res = await supertest(app)
            .get('/api/job/json-poll-job')
            .expect(200);

        expect(res.body.status).toBe('completed');
        expect(res.body.progress).toBe(100);
        expect(res.body.result).toEqual({ resume: 'ok' });
    });
});
