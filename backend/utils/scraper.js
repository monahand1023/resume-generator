'use strict';

const puppeteer = require('puppeteer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const config = require('../config');
const logger = require('./logger');
const { validateJobUrl } = require('./ssrf');

/**
 * Scrapes the text content of a job posting URL using a headless browser.
 *
 * The URL is validated for SSRF safety before navigation, and request
 * interception rejects any main-frame navigation (including redirects) that
 * resolves to a private/reserved address.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
async function scrapeJobDescription(url) {
    // Reject private/reserved targets before spending a browser launch on them.
    await validateJobUrl(url);

    const browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: 'new',
    });

    try {
        const page = await browser.newPage();

        // Validate every main-frame navigation (covers redirect-based SSRF
        // bypass — the equivalent of the Go client's CheckRedirect hook).
        await page.setRequestInterception(true);
        page.on('request', async (req) => {
            if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
                try {
                    await validateJobUrl(req.url());
                    await req.continue();
                } catch (err) {
                    logger.warn('blocked navigation during scrape', { url: req.url(), error: err });
                    await req.abort('blockedbyclient');
                }
            } else {
                await req.continue();
            }
        });

        await page.goto(url, { waitUntil: 'networkidle0', timeout: config.scrapeTimeoutMs });

        const content = await page.evaluate(() => {
            // Runs in the browser context, where `document` is defined.
            /* eslint-disable-next-line no-undef */
            document.querySelectorAll('script, style').forEach((el) => el.remove());
            /* eslint-disable-next-line no-undef */
            return document.body.innerText;
        });

        return content;
    } finally {
        await browser.close();
    }
}

/**
 * Extracts plain text from a PDF or Word document buffer.
 * Detects format via magic bytes — does not rely on MIME type.
 *
 * @param {Buffer} fileBuffer
 * @returns {Promise<string>}
 */
async function parseResumeFile(fileBuffer) {
    const uint8Array = new Uint8Array(fileBuffer);

    // PDF magic: %PDF
    if (
        uint8Array[0] === 0x25 &&
        uint8Array[1] === 0x50 &&
        uint8Array[2] === 0x44 &&
        uint8Array[3] === 0x46
    ) {
        const data = await pdfParse(fileBuffer);
        return data.text;
    }

    // Word / OOXML (ZIP)
    try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return result.value;
    } catch (_e) {
        throw new Error('Unable to parse resume file. Please upload a PDF or Word document.');
    }
}

module.exports = { scrapeJobDescription, parseResumeFile };
