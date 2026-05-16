'use strict';

const puppeteer = require('puppeteer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Scrapes the text content of a job posting URL using a headless browser.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
async function scrapeJobDescription(url) {
    const browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: 'new',
    });

    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0' });

        const content = await page.evaluate(() => {
            document.querySelectorAll('script, style').forEach((el) => el.remove());
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
