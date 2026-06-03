'use strict';

const { extractJobDetails } = require('../utils/clean');

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
