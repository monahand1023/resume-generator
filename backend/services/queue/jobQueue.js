'use strict';

const { randomUUID } = require('crypto');

/**
 * In-memory async job queue.
 *
 * Each job entry: { status, result, error, createdAt, progress }
 *   status: 'pending' | 'processing' | 'completed' | 'failed'
 */

const jobs = new Map();

/**
 * Enqueue an async function for background execution.
 *
 * @param {() => Promise<any>} fn - The async work to perform.
 * @returns {string} jobId UUID
 */
function enqueue(fn) {
    const jobId = randomUUID();

    jobs.set(jobId, {
        status: 'pending',
        result: null,
        error: null,
        createdAt: Date.now(),
        progress: 0,
    });

    // Fire-and-forget — intentionally not awaited
    (async () => {
        const job = jobs.get(jobId);
        if (!job) return;

        job.status = 'processing';
        job.progress = 10;

        try {
            const result = await fn();
            job.status = 'completed';
            job.result = result;
            job.progress = 100;
        } catch (err) {
            job.status = 'failed';
            job.error = err instanceof Error ? err.message : String(err);
            job.progress = 0;
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
        }
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldJobs, 5 * 60 * 1000).unref();

module.exports = { enqueue, getJob, cleanupOldJobs, jobs };
