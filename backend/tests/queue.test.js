'use strict';

const { enqueue, getJob, cleanupOldJobs, jobs } = require('../services/queue/jobQueue');

// Helper: wait for a job to reach a terminal state (completed or failed)
function waitForTerminal(jobId, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
            const job = getJob(jobId);
            if (!job) {
                clearInterval(interval);
                reject(new Error(`Job ${jobId} not found`));
                return;
            }
            if (job.status === 'completed' || job.status === 'failed') {
                clearInterval(interval);
                resolve(job);
                return;
            }
            if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                reject(new Error(`Job ${jobId} did not reach terminal state within ${timeoutMs}ms`));
            }
        }, 10);
    });
}

describe('jobQueue', () => {
    beforeEach(() => {
        // Clear the map before each test for isolation
        jobs.clear();
    });

    test('enqueue returns a string jobId', () => {
        const jobId = enqueue(() => Promise.resolve('ok'));
        expect(typeof jobId).toBe('string');
        expect(jobId.length).toBeGreaterThan(0);
    });

    test('job starts as pending immediately after enqueue', () => {
        const jobId = enqueue(() => new Promise(resolve => setTimeout(resolve, 500)));
        const job = getJob(jobId);
        // status is pending or processing (microtask may have run already)
        expect(['pending', 'processing']).toContain(job.status);
    });

    test('successful job transitions to completed with result', async () => {
        const expected = { data: 'hello' };
        const jobId = enqueue(() => Promise.resolve(expected));
        const job = await waitForTerminal(jobId);
        expect(job.status).toBe('completed');
        expect(job.result).toEqual(expected);
        expect(job.error).toBeNull();
        expect(job.progress).toBe(100);
    });

    test('failing job transitions to failed with error message', async () => {
        const jobId = enqueue(() => Promise.reject(new Error('AI blew up')));
        const job = await waitForTerminal(jobId);
        expect(job.status).toBe('failed');
        expect(job.error).toBe('AI blew up');
        expect(job.result).toBeNull();
    });

    test('non-Error rejection is captured as a string', async () => {
        const jobId = enqueue(() => Promise.reject('plain string error'));
        const job = await waitForTerminal(jobId);
        expect(job.status).toBe('failed');
        expect(job.error).toBe('plain string error');
    });

    test('getJob returns null for unknown jobId', () => {
        const result = getJob('00000000-0000-0000-0000-000000000000');
        expect(result).toBeNull();
    });

    test('cleanupOldJobs removes jobs older than 1 hour but keeps recent ones', () => {
        const ONE_HOUR_MS = 60 * 60 * 1000;

        // Insert a stale job directly into the map
        jobs.set('stale-job', {
            status: 'completed',
            result: null,
            error: null,
            createdAt: Date.now() - ONE_HOUR_MS - 1000, // 1 hour + 1 second ago
            progress: 100,
        });

        // Insert a recent job
        jobs.set('fresh-job', {
            status: 'pending',
            result: null,
            error: null,
            createdAt: Date.now(),
            progress: 0,
        });

        cleanupOldJobs();

        expect(jobs.has('stale-job')).toBe(false);
        expect(jobs.has('fresh-job')).toBe(true);
    });

    test('cleanupOldJobs leaves an empty map untouched', () => {
        expect(() => cleanupOldJobs()).not.toThrow();
        expect(jobs.size).toBe(0);
    });

    test('multiple concurrent jobs are tracked independently', async () => {
        const idA = enqueue(() => Promise.resolve('result-A'));
        const idB = enqueue(() => Promise.reject(new Error('fail-B')));
        const idC = enqueue(() => Promise.resolve('result-C'));

        const [jobA, jobB, jobC] = await Promise.all([
            waitForTerminal(idA),
            waitForTerminal(idB),
            waitForTerminal(idC),
        ]);

        expect(jobA.status).toBe('completed');
        expect(jobA.result).toBe('result-A');

        expect(jobB.status).toBe('failed');
        expect(jobB.error).toBe('fail-B');

        expect(jobC.status).toBe('completed');
        expect(jobC.result).toBe('result-C');
    });

    test('each enqueue call generates a unique jobId', () => {
        const ids = new Set();
        for (let i = 0; i < 10; i++) {
            ids.add(enqueue(() => Promise.resolve(i)));
        }
        expect(ids.size).toBe(10);
    });
});
