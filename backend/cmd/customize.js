#!/usr/bin/env node
'use strict';

// Keep the structured logger quiet unless the user explicitly opts in — the CLI
// prints its own progress. (Must be set before requiring config/logger.)
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'silent';

const fs = require('fs/promises');
const path = require('path');

const config = require('../config');
const { validateJobUrl } = require('../utils/ssrf');
const { scrapeJobDescription, parseResumeFile } = require('../utils/scraper');
const { extractNameFromResume, extractJobDetails } = require('../utils/clean');
const registry = require('../services/ai');
const { missingMarkers } = require('../services/ai/validate');
const { createStyledPDF } = require('../services/document/pdf');
const { createWordDoc } = require('../services/document/docx');
const { renderMarkdown, renderPlainText } = require('../services/document/render');

// Env var that supplies each user-key provider's API key.
const ENV_KEYS = {
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY',
    claude: 'ANTHROPIC_API_KEY',
};

const VALID_FORMATS = ['pdf', 'docx', 'md', 'txt'];

const USAGE = `
Tailor a resume + cover letter for a job posting.

Usage:
  customize <resume.(pdf|docx)> <job-url> [options]

Options:
  --provider <id>   openai | gemini | claude | bedrock  (default: auto-detect from env)
  --out <dir>       output directory                    (default: ./out)
  --format <list>   comma-separated: pdf,docx,md,txt    (default: pdf,docx)
  -h, --help        show this help

Provider keys are read from the environment:
  OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY
  (Bedrock uses your AWS credentials — no key needed.)

Example:
  ANTHROPIC_API_KEY=sk-ant-... customize ./resume.pdf "https://co/jobs/123" --provider claude
`;

/** Parses argv into { positional, provider, out, formats, help }. */
function parseArgs(argv) {
    const args = argv.slice(2);
    const opts = { positional: [], provider: null, out: 'out', formats: ['pdf', 'docx'], help: false };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-h' || a === '--help') opts.help = true;
        else if (a === '--provider') opts.provider = args[++i];
        else if (a === '--out') opts.out = args[++i];
        else if (a === '--format') opts.formats = args[++i].split(',').map((s) => s.trim()).filter(Boolean);
        else if (a.startsWith('--')) throw new Error(`unknown option: ${a}`);
        else opts.positional.push(a);
    }
    return opts;
}

/**
 * Resolves the provider + API key to use. With no explicit --provider, picks the
 * first provider whose key is set (claude → openai → gemini), then Bedrock if
 * AWS is configured.
 *
 * @returns {{ provider: object, apiKey: string|null }}
 */
function pickProvider(requested, env, reg) {
    if (requested) {
        const provider = reg.getProvider(requested);
        if (!provider) throw new Error(`unknown provider: ${requested}`);
        if (provider.usesServerCredentials) {
            if (!provider.isAvailable()) {
                throw new Error(`${requested} is not available — configure AWS credentials (or set BEDROCK_ENABLED=true)`);
            }
            return { provider, apiKey: null };
        }
        const apiKey = (env[ENV_KEYS[requested]] || '').trim();
        if (!apiKey) throw new Error(`${requested} needs ${ENV_KEYS[requested]} to be set`);
        return { provider, apiKey };
    }

    for (const id of ['claude', 'openai', 'gemini']) {
        const apiKey = (env[ENV_KEYS[id]] || '').trim();
        if (apiKey) return { provider: reg.getProvider(id), apiKey };
    }

    const bedrock = reg.getProvider('bedrock');
    if (bedrock && bedrock.isAvailable()) return { provider: bedrock, apiKey: null };

    throw new Error(
        'no provider configured. Set one of OPENAI_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY, or configure AWS for Bedrock.'
    );
}

const cleanPart = (v, fallback) => String(v || fallback).replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

/** Builds an output filename, e.g. Jane_Doe_Resume_Acme_Senior_SWE.pdf */
function outName(kind, meta, ext) {
    const name = cleanPart(meta.name, 'Resume');
    const company = cleanPart(meta.company, 'Company');
    const position = cleanPart(meta.position, 'Position');
    const label = kind === 'resume' ? 'Resume' : 'CoverLetter';
    return `${name}_${label}_${company}_${position}.${ext}`;
}

/** Renders marker content into the requested format, returning a Buffer. */
async function renderTo(format, content, meta) {
    switch (format) {
        case 'pdf':
            return createStyledPDF(content, meta.name, meta.company, meta.position);
        case 'docx':
            return createWordDoc(content, meta.name);
        case 'md':
            return Buffer.from(renderMarkdown(content), 'utf8');
        case 'txt':
            return Buffer.from(renderPlainText(content), 'utf8');
        default:
            throw new Error(`unknown format: ${format}`);
    }
}

/**
 * Renders every (document × format) pair into outDir.
 *
 * @param {string} outDir
 * @param {string[]} formats
 * @param {{name,company,position}} meta
 * @param {{resume: string, cover_letter: string}} docs
 * @returns {Promise<string[]>} written file paths
 */
async function writeOutputs(outDir, formats, meta, docs) {
    await fs.mkdir(outDir, { recursive: true });
    const written = [];
    for (const [kind, content] of Object.entries(docs)) {
        for (const fmt of formats) {
            const buffer = await renderTo(fmt, content, meta);
            const file = path.join(outDir, outName(kind, meta, fmt));
            await fs.writeFile(file, buffer);
            written.push(file);
        }
    }
    return written;
}

// Pull the one-line METRICS summary out of the changes output, if present.
function metricsLine(changes) {
    const m = /^\s*\*{0,2}METRICS:\s*\*{0,2}(.+)$/im.exec(changes || '');
    return m ? m[1].replace(/\*\*/g, '').trim() : null;
}

const step = (msg) => process.stderr.write(msg);

async function main(argv = process.argv) {
    const opts = parseArgs(argv);
    if (opts.help) {
        process.stdout.write(USAGE);
        return 0;
    }
    if (opts.positional.length < 2) {
        process.stderr.write(USAGE);
        return 1;
    }

    const [resumePath, jobUrl] = opts.positional;
    for (const f of opts.formats) {
        if (!VALID_FORMATS.includes(f)) throw new Error(`unknown format: ${f} (valid: ${VALID_FORMATS.join(', ')})`);
    }

    const { provider, apiKey } = pickProvider(opts.provider, process.env, registry);
    const resumeBuffer = await fs.readFile(resumePath);

    step('validating url…  ');
    await validateJobUrl(jobUrl);
    process.stderr.write('✓\n');

    step('scraping job posting…  ');
    const rawJobDescription = await scrapeJobDescription(jobUrl);
    const jobDescription = rawJobDescription.slice(0, config.jdMaxLength);
    process.stderr.write('✓\n');

    step('parsing resume…  ');
    let resumeText = await parseResumeFile(resumeBuffer);
    if (resumeText.length > config.maxResumeChars) resumeText = resumeText.slice(0, config.maxResumeChars);
    process.stderr.write('✓\n');

    const meta = {
        name: extractNameFromResume(resumeText),
        ...extractJobDetails(jobDescription),
    };

    step(`generating with ${provider.id}…  `);
    const [resumeOut, coverLetter, changes] = await Promise.all([
        provider.customize({ resumeText, jobDescription, apiKey, type: 'resume' }),
        provider.customize({ resumeText, jobDescription, apiKey, type: 'cover_letter' }),
        provider.customize({ resumeText, jobDescription, apiKey, type: 'changes' }),
    ]);
    process.stderr.write('✓\n');

    const bad = [...missingMarkers(resumeOut, 'resume'), ...missingMarkers(coverLetter, 'cover_letter')];
    if (bad.length) {
        throw new Error(
            `${provider.label} returned malformed output (missing: ${bad.join(', ')}). Try again, or a different --provider.`
        );
    }

    const written = await writeOutputs(opts.out, opts.formats, meta, { resume: resumeOut, cover_letter: coverLetter });

    process.stdout.write(`\n${meta.position} @ ${meta.company}\n`);
    const metrics = metricsLine(changes);
    if (metrics) process.stdout.write(`${metrics}\n`);
    process.stdout.write('\nwrote:\n');
    for (const f of written) process.stdout.write(`  ${f}\n`);
    return 0;
}

// Run only when invoked directly (so tests can import the helpers).
if (require.main === module) {
    main()
        .then((code) => process.exit(code))
        .catch((err) => {
            process.stderr.write(`\nerror: ${err.message}\n`);
            process.exit(1);
        });
}

module.exports = { parseArgs, pickProvider, outName, renderTo, writeOutputs, metricsLine, main, ENV_KEYS };
