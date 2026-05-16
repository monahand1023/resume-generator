'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const resumeRoutes = require('./routes/resume');

// ---------------------------------------------------------------------------
// Multer security: MIME-type allowlist + 10 MB size cap
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
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter,
});

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

// Global rate limit: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});

// Strict limit for the expensive AI endpoint: 10 per hour
const resumeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded for resume customization. Please wait before trying again.' },
});

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(globalLimiter);
app.use('/api/customize-resume', resumeLimiter);

// Attach multer to the customize-resume endpoint only (it needs the file)
app.use('/api/customize-resume', upload.single('resume'));

// API routes
app.use('/api', resumeRoutes);

// Serve React SPA for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
