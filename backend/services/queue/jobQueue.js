'use strict';

const { randomUUID } = require('crypto');
const { getDb, upsertJob, deleteJob, loadPendingJobs } = require('./db');

/**
 * In-memory async job queue with SQLite persistence.
 *
 * Each job entry: { status, result, error, createdAt, progress }
 *   status: 'pending' | 'processing' | 'completed' | 'failed'
 *
 * The in-memory Map is the primary runtime store; SQLite is used for
 * persistence across server restarts.
 */

const jobs = new Map();

// ---------------------------------------------------------------------------
// Startup recovery: restore non-terminal jobs from SQLite
// ---------------------------------------------------------------------------
(function recoverJobsFromDb() {
    const pending = loadPendingJobs(getDb());
    for (const row of pending) {
        const now = Date.now();
        const job = {
            status: 'failed',
            result: null,
            error: 'Server restarted',
            createdAt: row.created_at,
            progress: 0,
        };
        // Restore to in-memory map so callers polling the job get a terminal state
        jobs.set(row.id, job);
        // Persist the failed state back to SQLite
        upsertJob(getDb()).run({
            id: row.id,
            status: job.status,
            result: null,
            error: job.error,
            progress: job.progress,
            created_at: row.created_at,
            updated_at: now,
        });
    }
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Persist the current state of a job to SQLite.
 *
 * @param {string} jobId
 * @param {{ status, result, error, createdAt, progress }} job
 */
function persistJob(jobId, job) {
    upsertJob(getDb()).run({
        id: jobId,
        status: job.status,
        result: job.result != null ? JSON.stringify(job.result) : null,
        error: job.error || null,
        progress: job.progress || 0,
        created_at: job.createdAt || Date.now(),
        updated_at: Date.now(),
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue an async function for background execution.
 *
 * @param {(onProgress: (pct: number) => void) => Promise<any>} fn - The async work to perform.
 *   The function receives an optional `onProgress` callback it can invoke with a 0-100 value.
 * @param {((pct: number) => void) | undefined} onProgress - Optional external progress listener.
 * @returns {string} jobId UUID
 */
function enqueue(fn, onProgress) {
    const jobId = randomUUID();

    const job = {
        status: 'pending',
        result: null,
        error: null,
        createdAt: Date.now(),
        progress: 0,
    };

    jobs.set(jobId, job);
    persistJob(jobId, job);

    // Fire-and-forget — intentionally not awaited
    (async () => {
        const j = jobs.get(jobId);
        if (!j) return;

        j.status = 'processing';
        j.progress = 10;
        persistJob(jobId, j);

        // Build a progress reporter that updates the job and notifies any listener
        const progressCallback = (pct) => {
            const clipped = Math.max(0, Math.min(100, pct));
            j.progress = clipped;
            persistJob(jobId, j);
            if (typeof onProgress === 'function') {
                onProgress(clipped);
            }
        };

        try {
            const result = await fn(progressCallback);
            j.status = 'completed';
            j.result = result;
            j.progress = 100;
            persistJob(jobId, j);
        } catch (err) {
            j.status = 'failed';
            j.error = err instanceof Error ? err.message : String(err);
            j.progress = 0;
            persistJob(jobId, j);
        }
    })();

    return jobId;
}

/**
 * Retrieve current state of a job.
 *
 * @param {string} jobId
 * @returns {{ status, result, error, createdAt, progress } | null}
 */
function getJob(jobId) {
    return jobs.get(jobId) ?? null;
}

/**
 * Remove jobs older than 1 hour.
 */
function cleanupOldJobs() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, job] of jobs.entries()) {
        if (job.createdAt < oneHourAgo) {
            jobs.delete(id);
            deleteJob(getDb()).run(id);
        }
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldJobs, 5 * 60 * 1000).unref();

module.exports = { enqueue, getJob, cleanupOldJobs, jobs };
