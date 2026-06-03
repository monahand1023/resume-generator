'use strict';

const { extractJobDetails, parseJobDetails, resolveJobDetails } = require('../utils/clean');
const { createPrompt } = require('../services/ai/prompts');

describe('extractJobDetails', () => {
    test('extracts a short company name and job title', () => {
        const jd = 'Acme Corporation\nSenior Software Engineer\nWe build great products.';
        const { company, position } = extractJobDetails(jd);
        expect(company).toBe('Acme Corporation');
        expect(position).toBe('Senior Software Engineer');
    });

    test('rejects a run-on paragraph instead of using it as the title', () => {
        const jd =
            'We are looking for a Strategic Account Executive who will play a critical role driving sales and expansion across our largest accounts at global scale';
        expect(extractJobDetails(jd).position).toBe('Position');
    });

    test('skips job-board nav boilerplate like "Back to jobs"', () => {
        const { company, position } = extractJobDetails('Back to jobs\nAcme Corporation\nWe are hiring.');
        expect(company).toBe('Acme Corporation');
        expect(company).not.toMatch(/back to jobs/i);
        expect(position).not.toMatch(/back to jobs/i);
    });

    test('falls back to defaults when nothing matches', () => {
        expect(extractJobDetails('lorem ipsum dolor sit amet')).toEqual({ company: 'Company', position: 'Position' });
    });
});

describe('parseJobDetails (AI extraction output)', () => {
    test('parses COMPANY / POSITION markers', () => {
        expect(parseJobDetails('COMPANY: Figma\nPOSITION: Strategic Account Executive')).toEqual({
            company: 'Figma',
            position: 'Strategic Account Executive',
        });
    });

    test('tolerates markdown-bold markers', () => {
        expect(parseJobDetails('**COMPANY:** Figma\n**POSITION:** Engineer')).toEqual({
            company: 'Figma',
            position: 'Engineer',
        });
    });

    test('drops Unknown, unfilled placeholders, and over-long values', () => {
        expect(parseJobDetails('COMPANY: Unknown\nPOSITION: [the job title]')).toEqual({ company: '', position: '' });
        expect(parseJobDetails(`COMPANY: ${'x'.repeat(200)}`).company).toBe('');
    });

    test('returns empty fields for null/garbage input', () => {
        expect(parseJobDetails(null)).toEqual({ company: '', position: '' });
    });
});

describe('resolveJobDetails (AI-first, heuristic fallback)', () => {
    test('prefers the AI values', () => {
        expect(resolveJobDetails('COMPANY: Figma\nPOSITION: AE', 'Acme Corporation\nSenior Engineer')).toEqual({
            company: 'Figma',
            position: 'AE',
        });
    });

    test('falls back per-field to the heuristic', () => {
        const r = resolveJobDetails('COMPANY: Figma', 'Acme\nSenior Engineer at the org');
        expect(r.company).toBe('Figma');
        expect(r.position).not.toBe('Position'); // heuristic supplied a position
    });

    test('falls back entirely when the AI output is null', () => {
        expect(resolveJobDetails(null, 'Acme Corporation\nSenior Software Engineer')).toEqual({
            company: 'Acme Corporation',
            position: 'Senior Software Engineer',
        });
    });
});

describe('job_details prompt', () => {
    test('asks for COMPANY and POSITION and embeds the JD', () => {
        const p = createPrompt('job_details', '', 'We are hiring at Figma.', 'plain');
        expect(p).toMatch(/COMPANY:/);
        expect(p).toMatch(/POSITION:/);
        expect(p).toContain('We are hiring at Figma.');
    });
});
