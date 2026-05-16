'use strict';

const express = require('express');
const router = express.Router();

const { scrapeJobDescription, parseResumeFile } = require('../utils/scraper');
const { extractNameFromResume, extractJobDetails, sanitizeFilename } = require('../utils/clean');
const { customizeWithOpenAI } = require('../services/ai/openai');
const { customizeWithGemini } = require('../services/ai/gemini');
const { customizeWithClaude } = require('../services/ai/claude');
const { createStyledPDF } = require('../services/document/pdf');
const { createWordDoc } = require('../services/document/docx');
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
 * POST /api/customize-resume
 *
 * Body (multipart/form-data):
 *   resume    – PDF or DOCX file
 *   jobUrl    – URL of the job posting
 *   apiKey    – API key for the chosen AI provider
 *   provider  – "openai" | "gemini" | "claude"
 *
 * Response (JSON):
 *   { resume, coverLetter, changes, metadata: { name, company, position } }
 */
router.post('/customize-resume', (req, res) => {
    const { jobUrl, apiKey, provider } = req.body;
    const resume = req.file?.buffer;

    if (!jobUrl || !apiKey || !resume || !provider) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Magic-byte verification (defence-in-depth beyond multer MIME check)
    const isPDF = checkMagicBytes(resume, 'pdf');
    const isDOCX = checkMagicBytes(resume, 'docx');
    if (!isPDF && !isDOCX) {
        return res.status(400).json({ error: 'Invalid file format. Only PDF and DOCX files are accepted.' });
    }

    const providerMap = {
        openai: customizeWithOpenAI,
        gemini: customizeWithGemini,
        claude: customizeWithClaude,
    };

    const customizeFunction = providerMap[provider];
    if (!customizeFunction) {
        return res.status(400).json({ error: 'Invalid provider' });
    }

    const jobId = enqueue(async () => {
        const jobDescription = await scrapeJobDescription(jobUrl);
        const resumeText = await parseResumeFile(resume);

        const name = extractNameFromResume(resumeText);
        const jobDetails = extractJobDetails(jobDescription);

        const [customizedResume, coverLetter, changes] = await Promise.all([
            customizeFunction(resumeText, jobDescription, apiKey, 'resume'),
            customizeFunction(resumeText, jobDescription, apiKey, 'cover_letter'),
            customizeFunction(resumeText, jobDescription, apiKey, 'changes'),
        ]);

        return {
            resume: customizedResume,
            coverLetter,
            changes,
            metadata: { name, company: jobDetails.company, position: jobDetails.position },
        };
    });

    res.status(202).json({ jobId, status: 'pending' });
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
 * terminal state (completed | failed) or 120 seconds elapse.
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

    // Maximum stream duration: 120 seconds
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
        console.error('Error formatting document:', error);
        res.status(500).json({ error: 'Failed to format document' });
    }
});

module.exports = router;
