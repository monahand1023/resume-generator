'use strict';

// Puppeteer is ESM-only and not exercised by these tests (SSRF/validation reject
// before any scrape), so stub it to keep it out of the require chain.
jest.mock('puppeteer', () => ({ launch: jest.fn() }));

const request = require('supertest');
const app = require('../server');

const RESUME_CONTENT = ['NAME: Jane Doe', 'SECTION: SUMMARY', 'SUMMARY_TEXT: Did things', 'BULLET: • Built X'].join('\n');

describe('GET /api/providers', () => {
    test('lists providers including openai', async () => {
        const res = await request(app).get('/api/providers');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.providers)).toBe(true);
        expect(res.body.providers.map((p) => p.id)).toContain('openai');
    });
});

describe('POST /api/format-document', () => {
    test('renders Markdown', async () => {
        const res = await request(app)
            .post('/api/format-document')
            .send({ content: RESUME_CONTENT, format: 'md', filename: 'r' });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/markdown/);
        expect(res.text).toContain('# Jane Doe');
        expect(res.text).toContain('- Built X');
    });

    test('renders clean plain text without markers', async () => {
        const res = await request(app)
            .post('/api/format-document')
            .send({ content: RESUME_CONTENT, format: 'txt', filename: 'r' });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/plain/);
        expect(res.text).not.toMatch(/NAME:/);
        expect(res.text).toContain('Jane Doe');
    });

    test('rejects an unsupported format', async () => {
        const res = await request(app)
            .post('/api/format-document')
            .send({ content: 'x', format: 'rtf', filename: 'r' });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/preview', () => {
    test('blocks a private/metadata URL (SSRF)', async () => {
        const res = await request(app)
            .post('/api/preview')
            .field('jobUrl', 'http://169.254.169.254/latest/meta-data/')
            .attach('resume', Buffer.from('%PDF-1.4 minimal'), { filename: 'r.pdf', contentType: 'application/pdf' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Invalid job URL/);
    });

    test('rejects a request with no resume file', async () => {
        const res = await request(app).post('/api/preview').field('jobUrl', 'http://example.com');
        expect(res.status).toBe(400);
    });
});
