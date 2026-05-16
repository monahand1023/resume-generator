'use strict';

const { cleanAIResponse } = require('../utils/clean');

describe('cleanAIResponse', () => {
    test('passes through normal resume text unchanged', () => {
        const input = 'NAME: John Smith\nSECTION: EXPERIENCE\nBULLET: • Built systems at scale';
        const result = cleanAIResponse(input);
        expect(result).toBe(input.trim());
    });

    test('strips AI commentary prefix ("This revised resume...")', () => {
        const input = `NAME: Jane Doe\nSECTION: SKILLS\nThis revised resume highlights your strengths.`;
        const result = cleanAIResponse(input);
        expect(result).not.toContain('This revised resume');
        expect(result).toContain('NAME: Jane Doe');
    });

    test('strips trailing commentary starting with "Note:"', () => {
        const input = `NAME: Bob\nNote: I made these changes to improve ATS scoring.`;
        const result = cleanAIResponse(input);
        expect(result).not.toContain('Note:');
        expect(result).toContain('NAME: Bob');
    });

    test('strips lines containing "key changes"', () => {
        const input = `SECTION: SUMMARY\nKey changes made to this resume include keyword insertion.`;
        const result = cleanAIResponse(input);
        expect(result).not.toContain('Key changes');
    });

    test('returns empty string for empty input', () => {
        expect(cleanAIResponse('')).toBe('');
    });

    test('returns empty string for whitespace-only input', () => {
        expect(cleanAIResponse('   \n\n  ')).toBe('');
    });

    test('preserves content that does not trigger commentary detection', () => {
        const input = `NAME: Alice\nCONTACT: alice@example.com\nSECTION: EXPERIENCE\nBULLET: • Delivered results`;
        const result = cleanAIResponse(input);
        expect(result).toContain('BULLET: • Delivered results');
    });
});
