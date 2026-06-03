'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const logger = require('./utils/logger');
const registry = require('./services/ai');
const resumeRoutes = require('./routes/resume');

// ---------------------------------------------------------------------------
// Multer security: MIME-type allowlist + size cap
// ---------------------------------------------------------------------------
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('File type not allowed. Only PDF and DOCX files are accepted.'), false);
    }
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxFileSizeBytes },
    fileFilter,
});

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------
const globalLimiter = rateLimit({
    windowMs: config.rateLimit.global.windowMs,
    max: config.rateLimit.global.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});

// Strict limit for the expensive AI endpoint.
const resumeLimiter = rateLimit({
    windowMs: config.rateLimit.resume.windowMs,
    max: config.rateLimit.resume.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded for resume customization. Please wait before trying again.' },
});

// Preview scrapes (Puppeteer) but skips the AI — its own, looser limit.
const previewLimiter = rateLimit({
    windowMs: config.rateLimit.preview.windowMs,
    max: config.rateLimit.preview.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded for input preview. Please wait before trying again.' },
});

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

const allowedOrigins = config.corsOrigins; // null = allow all in dev

app.use(cors({
    origin: allowedOrigins
        ? (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
            cb(new Error('Not allowed by CORS'));
        }
        : true,
    credentials: false,
}));
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
}
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health endpoint — not subject to the global rate limiter
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
    });
});

app.use(globalLimiter);
app.use('/api/customize-resume', resumeLimiter);
app.use('/api/preview', previewLimiter);

// Attach multer to the endpoints that receive the resume file.
app.use('/api/customize-resume', upload.single('resume'));
app.use('/api/preview', upload.single('resume'));

// API routes
app.use('/api', resumeRoutes);

// Serve React SPA for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Error handler — turn known failures into clean 4xx responses instead of a
// generic 500 (multer upload errors, CORS rejections).
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : `Upload error: ${err.message}`;
        return res.status(400).json({ error: msg });
    }
    if (err && err.message && err.message.startsWith('File type not allowed')) {
        return res.status(400).json({ error: err.message });
    }
    if (err && err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: err.message });
    }

    logger.error('unhandled error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
// Only listen when run directly (not when imported by tests).
if (require.main === module) {
    app.listen(config.port, () => {
        logger.info('server started', {
            port: config.port,
            providers: registry.availableProviders().map((p) => p.id),
        });
    });
}

module.exports = app;
