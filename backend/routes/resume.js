'use strict';

const express = require('express');
const router = express.Router();

const config = require('../config');
const logger = require('../utils/logger');
const { scrapeJobDescription, parseResumeFile } = require('../utils/scraper');
const { validateJobUrl } = require('../utils/ssrf');
const { extractNameFromResume, extractJobDetails, sanitizeFilename } = require('../utils/clean');
const registry = require('../services/ai');
const { missingMarkers } = require('../services/ai/validate');
const { createStyledPDF } = require('../services/document/pdf');
const { createWordDoc } = require('../services/document/docx');
const { renderMarkdown, renderPlainText } = require('../services/document/render');
const resultCache = require('../services/cache/resultCache');
const { enqueue, getJob } = require('../services/queue/jobQueue');

// Magic-byte lookup (must match the multer guard in server.js)
const ALLOWED_MAGIC_BYTES = {
    pdf: [0x25, 0x50, 0x44, 0x46],
    docx: [0x50, 0x4b, 0x03, 0x04],
};

function checkMagicBytes(buffer, type) {
    return ALLOWED_MAGIC_BYTES[type].every((byte, i) => buffer[i] === byte);
}

/**
 * GET /api/providers
 *
 * Lists AI providers and their availability so the frontend can render only the
 * providers this server supports (e.g. Bedrock appears only when AWS is set up).
 */
router.get('/providers', (req, res) => {
    res.json({ providers: registry.describeProviders() });
});

/**
 * POST /api/customize-resume
 *
 * Body (multipart/form-data):
 *   resume    – PDF or DOCX file
 *   jobUrl    – URL of the job posting
 *   apiKey    – API key for the chosen AI provider (omitted for server-credential providers)
 *   provider  – provider id, e.g. "openai" | "gemini" | "claude" | "bedrock"
 *
 * Response: { jobId, status } — poll GET /api/job/:jobId(/stream) for the result.
 */
router.post('/customize-resume', async (req, res) => {
    const { jobUrl, apiKey, provider } = req.body;
    const resume = req.file?.buffer;

    const descriptor = registry.getProvider(provider);
    if (!descriptor) {
        return res.status(400).json({ error: 'Invalid provider' });
    }
    if (!descriptor.isAvailable()) {
        return res.status(400).json({ error: `Provider "${provider}" is not available on this server` });
    }

    const needsKey = !descriptor.usesServerCredentials;
    if (!jobUrl || !resume || (needsKey && !apiKey)) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Magic-byte verification (defence-in-depth beyond multer MIME check)
    const isPDF = checkMagicBytes(resume, 'pdf');
    const isDOCX = checkMagicBytes(resume, 'docx');
    if (!isPDF && !isDOCX) {
        return res.status(400).json({ error: 'Invalid file format. Only PDF and DOCX files are accepted.' });
    }

    if (typeof jobUrl !== 'string' || jobUrl.length > config.maxJobUrlLength) {
        return res.status(400).json({ error: 'Job URL is missing or too long' });
    }

    const keyError = registry.validateKey(provider, apiKey);
    if (keyError) {
        return res.status(400).json({ error: keyError });
    }

    // Reject private/reserved URLs up front (SSRF) so the caller gets a 400
    // rather than a failed job later.
    try {
        await validateJobUrl(jobUrl);
    } catch (err) {
        return res.status(400).json({ error: `Invalid job URL: ${err.message}` });
    }

    const cacheKey = resultCache.keyFor(provider, jobUrl, resume);

    const jobId = enqueue(async () => {
        // Same resume + job URL + provider → reuse the prior result instead of
        // re-scraping and re-spending AI tokens.
        const cached = resultCache.get(cacheKey);
        if (cached) {
            logger.info('result cache hit', { provider });
            return cached;
        }

        const rawJobDescription = await scrapeJobDescription(jobUrl);
        const jobDescription = rawJobDescription.slice(0, config.jdMaxLength);

        let resumeText = await parseResumeFile(resume);
        if (resumeText.length > config.maxResumeChars) {
            logger.warn('resume text truncated', { length: resumeText.length, cap: config.maxResumeChars });
            resumeText = resumeText.slice(0, config.maxResumeChars);
        }

        const name = extractNameFromResume(resumeText);
        const jobDetails = extractJobDetails(jobDescription);

        const [customizedResume, coverLetter, changes] = await Promise.all([
            descriptor.customize({ resumeText, jobDescription, apiKey, type: 'resume' }),
            descriptor.customize({ resumeText, jobDescription, apiKey, type: 'cover_letter' }),
            descriptor.customize({ resumeText, jobDescription, apiKey, type: 'changes' }),
        ]);

        // Reject malformed output for the downloadable documents so it never
        // reaches the renderers. The changes summary has a graceful raw-text
        // fallback in the UI, so it is only warned about.
        const badMarkers = [
            ...missingMarkers(customizedResume, 'resume'),
            ...missingMarkers(coverLetter, 'cover_letter'),
        ];
        if (badMarkers.length) {
            throw new Error(
                `${descriptor.label} returned malformed output (missing: ${badMarkers.join(', ')}). Please retry.`
            );
        }
        const changesMissing = missingMarkers(changes, 'changes');
        if (changesMissing.length) {
            logger.warn('changes output missing markers', { provider, missing: changesMissing });
        }

        const result = {
            resume: customizedResume,
            coverLetter,
            changes,
            metadata: { name, company: jobDetails.company, position: jobDetails.position },
        };
        resultCache.set(cacheKey, result);
        return result;
    });

    res.status(202).json({ jobId, status: 'pending' });
});

/**
 * POST /api/preview
 *
 * Body (multipart/form-data): resume file + jobUrl.
 * Scrapes and parses the inputs WITHOUT calling the AI, so the user can see
 * exactly what the model will receive (and whether company/position were
 * detected) before spending tokens.
 *
 * Response: { jobDescription, resumeText, metadata: { name, company, position } }
 */
router.post('/preview', async (req, res) => {
    const { jobUrl } = req.body;
    const resume = req.file?.buffer;

    if (!jobUrl || !resume) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (typeof jobUrl !== 'string' || jobUrl.length > config.maxJobUrlLength) {
        return res.status(400).json({ error: 'Job URL is missing or too long' });
    }

    const isPDF = checkMagicBytes(resume, 'pdf');
    const isDOCX = checkMagicBytes(resume, 'docx');
    if (!isPDF && !isDOCX) {
        return res.status(400).json({ error: 'Invalid file format. Only PDF and DOCX files are accepted.' });
    }

    try {
        await validateJobUrl(jobUrl);
    } catch (err) {
        return res.status(400).json({ error: `Invalid job URL: ${err.message}` });
    }

    try {
        const rawJobDescription = await scrapeJobDescription(jobUrl);
        const jobDescription = rawJobDescription.slice(0, config.jdMaxLength);

        let resumeText = await parseResumeFile(resume);
        if (resumeText.length > config.maxResumeChars) {
            resumeText = resumeText.slice(0, config.maxResumeChars);
        }

        const name = extractNameFromResume(resumeText);
        const jobDetails = extractJobDetails(jobDescription);

        res.json({
            jobDescription,
            resumeText,
            metadata: { name, company: jobDetails.company, position: jobDetails.position },
        });
    } catch (err) {
        logger.error('preview failed', { error: err });
        res.status(500).json({ error: 'Failed to preview inputs' });
    }
});

/**
 * GET /api/job/:jobId
 *
 * Returns the current state of an enqueued job.
 * Response: { status, result, error, progress }
 */
router.get('/job/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    res.json({
        status: job.status,
        result: job.result,
        error: job.error,
        progress: job.progress,
    });
});

/**
 * GET /api/job/:jobId/stream
 *
 * Server-Sent Events endpoint. Streams job state until the job reaches a
 * terminal state (completed | failed) or the configured stream timeout elapses.
 *
 * Event payload: JSON with { status, result, error, progress }
 */
router.get('/job/:jobId/stream', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Helper to send the current job snapshot
    const sendJobState = () => {
        sendEvent({
            status: job.status,
            result: job.result,
            error: job.error,
            progress: job.progress,
        });
    };

    // Send current state immediately
    sendJobState();

    // If already terminal, close right away
    if (job.status === 'completed' || job.status === 'failed') {
        res.end();
        return;
    }

    let interval = null;

    const timeout = setTimeout(() => {
        if (interval) clearInterval(interval);
        sendEvent({
            status: 'failed',
            result: null,
            error: `Stream timeout: job did not complete within ${Math.round(config.queue.streamTimeoutMs / 1000)} seconds`,
            progress: 0,
        });
        res.end();
    }, config.queue.streamTimeoutMs);

    interval = setInterval(() => {
        if (job.status === 'completed' || job.status === 'failed') {
            clearInterval(interval);
            clearTimeout(timeout);
            sendJobState();
            res.end();
        }
    }, 250);

    // Clean up on client disconnect
    req.on('close', () => {
        if (interval) clearInterval(interval);
        clearTimeout(timeout);
    });
});

/**
 * POST /api/format-document
 *
 * Body (JSON):
 *   content   – AI-generated document text
 *   format    – "pdf" | "docx"
 *   filename  – base filename (no extension)
 *   metadata  – { name?, company?, position? }
 *
 * Response: binary file download
 */
router.post('/format-document', async (req, res) => {
    try {
        const { content, format, filename, metadata } = req.body;

        if (!content || !format || !filename) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let buffer;
        let contentType;
        let fileExtension;

        if (format === 'pdf') {
            const name = metadata?.name || 'Resume';
            const company = metadata?.company || '';
            const position = metadata?.position || '';
            buffer = await createStyledPDF(content, name, company, position);
            contentType = 'application/pdf';
            fileExtension = 'pdf';
        } else if (format === 'docx') {
            buffer = await createWordDoc(content, filename);
            contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            fileExtension = 'docx';
        } else if (format === 'md') {
            buffer = Buffer.from(renderMarkdown(content), 'utf-8');
            contentType = 'text/markdown; charset=utf-8';
            fileExtension = 'md';
        } else if (format === 'txt') {
            buffer = Buffer.from(renderPlainText(content), 'utf-8');
            contentType = 'text/plain; charset=utf-8';
            fileExtension = 'txt';
        } else {
            return res.status(400).json({ error: 'Unsupported format' });
        }

        const safeBase = sanitizeFilename(filename);
        const encodedFilename = encodeURIComponent(safeBase);
        res.setHeader('Content-Type', contentType);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${safeBase}.${fileExtension}"; filename*=UTF-8''${encodedFilename}.${fileExtension}`
        );
        res.send(buffer);
    } catch (error) {
        logger.error('Error formatting document', { error });
        res.status(500).json({ error: 'Failed to format document' });
    }
});

module.exports = router;
