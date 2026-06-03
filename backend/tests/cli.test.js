'use strict';

// The CLI imports the scraper, which pulls in ESM-only Puppeteer; stub it (the
// unit tests below never scrape).
jest.mock('puppeteer', () => ({ launch: jest.fn() }));

const os = require('os');
const fs = require('fs/promises');
const path = require('path');

const registry = require('../services/ai');
const { parseArgs, pickProvider, outName, writeOutputs, metricsLine } = require('../cmd/customize');

const RESUME = 'NAME: Jane Doe\nSECTION: SUMMARY\nSUMMARY_TEXT: Did things\nBULLET: • Built X';
const COVER = 'HEADER: Jane Doe\nBODY_PARAGRAPH: I am writing to apply.\nCLOSING: Sincerely,';

describe('parseArgs', () => {
    test('parses positional args and options', () => {
        const o = parseArgs(['node', 'cli', 'r.pdf', 'http://x', '--provider', 'claude', '--format', 'pdf,md', '--out', 'dist']);
        expect(o.positional).toEqual(['r.pdf', 'http://x']);
        expect(o.provider).toBe('claude');
        expect(o.formats).toEqual(['pdf', 'md']);
        expect(o.out).toBe('dist');
        expect(o.help).toBe(false);
    });

    test('applies defaults', () => {
        const o = parseArgs(['node', 'cli', 'r.pdf', 'http://x']);
        expect(o.formats).toEqual(['pdf', 'docx']);
        expect(o.out).toBe('out');
    });

    test('--help sets help', () => {
        expect(parseArgs(['node', 'cli', '--help']).help).toBe(true);
    });

    test('unknown option throws', () => {
        expect(() => parseArgs(['node', 'cli', '--bogus'])).toThrow(/unknown option/);
    });
});

describe('pickProvider', () => {
    test('explicit provider uses its env key', () => {
        const { provider, apiKey } = pickProvider('openai', { OPENAI_API_KEY: 'sk-x' }, registry);
        expect(provider.id).toBe('openai');
        expect(apiKey).toBe('sk-x');
    });

    test('explicit provider without its key throws', () => {
        expect(() => pickProvider('openai', {}, registry)).toThrow(/OPENAI_API_KEY/);
    });

    test('unknown provider throws', () => {
        expect(() => pickProvider('nope', {}, registry)).toThrow(/unknown provider/);
    });

    test('auto-detect prefers claude when its key is set', () => {
        const { provider } = pickProvider(null, { ANTHROPIC_API_KEY: 'sk-ant-x', OPENAI_API_KEY: 'sk-x' }, registry);
        expect(provider.id).toBe('claude');
    });

    test('no keys and no Bedrock throws a helpful error', () => {
        const prev = process.env.BEDROCK_ENABLED;
        process.env.BEDROCK_ENABLED = 'false';
        try {
            expect(() => pickProvider(null, {}, registry)).toThrow(/no provider configured/);
        } finally {
            if (prev === undefined) delete process.env.BEDROCK_ENABLED;
            else process.env.BEDROCK_ENABLED = prev;
        }
    });
});

describe('outName', () => {
    test('sanitizes name/company/position', () => {
        expect(outName('resume', { name: 'Jane Doe', company: 'Acme Inc.', position: 'Senior SWE' }, 'pdf')).toBe(
            'Jane_Doe_Resume_Acme_Inc_Senior_SWE.pdf'
        );
        expect(outName('cover_letter', { name: 'Jane Doe', company: 'Acme', position: 'SWE' }, 'docx')).toBe(
            'Jane_Doe_CoverLetter_Acme_SWE.docx'
        );
    });
});

describe('metricsLine', () => {
    test('extracts the METRICS summary (incl. markdown-bold), else null', () => {
        expect(metricsLine('METRICS: Added 5 keywords\nCHANGE: x')).toBe('Added 5 keywords');
        expect(metricsLine('**METRICS:** Added 3 keywords')).toBe('Added 3 keywords');
        expect(metricsLine('no metrics here')).toBeNull();
    });
});

describe('writeOutputs', () => {
    let dir;
    beforeAll(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-'));
    });
    afterAll(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    test('writes valid files for every document × format', async () => {
        const meta = { name: 'Jane Doe', company: 'Acme', position: 'SWE' };
        const written = await writeOutputs(dir, ['pdf', 'docx', 'md', 'txt'], meta, {
            resume: RESUME,
            cover_letter: COVER,
        });
        expect(written).toHaveLength(8);

        const pdf = await fs.readFile(path.join(dir, 'Jane_Doe_Resume_Acme_SWE.pdf'));
        expect(pdf.slice(0, 4).toString()).toBe('%PDF');

        const docx = await fs.readFile(path.join(dir, 'Jane_Doe_Resume_Acme_SWE.docx'));
        expect(docx.slice(0, 2).toString()).toBe('PK'); // zip magic

        const txt = await fs.readFile(path.join(dir, 'Jane_Doe_Resume_Acme_SWE.txt'), 'utf8');
        expect(txt).not.toMatch(/NAME:/);
        expect(txt).toContain('Jane Doe');

        const md = await fs.readFile(path.join(dir, 'Jane_Doe_CoverLetter_Acme_SWE.md'), 'utf8');
        expect(md).toContain('# Jane Doe');
    });
});
