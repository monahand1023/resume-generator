'use strict';

const { missingMarkers } = require('../services/ai/validate');

describe('missingMarkers', () => {
    test('well-formed resume passes', () => {
        const text = 'NAME: Jane Doe\nSECTION: EXPERIENCE\nBULLET: • did things';
        expect(missingMarkers(text, 'resume')).toEqual([]);
    });

    test('resume missing NAME is flagged', () => {
        const text = 'SECTION: EXPERIENCE\nBULLET: • did things';
        expect(missingMarkers(text, 'resume')).toContain('NAME');
    });

    test('resume with NAME but no body content is flagged', () => {
        expect(missingMarkers('NAME: Jane Doe', 'resume').length).toBeGreaterThan(0);
    });

    test('markdown-bold markers (**NAME:**) are accepted', () => {
        const text = '**NAME:** Jane\n**SECTION:** EXPERIENCE';
        expect(missingMarkers(text, 'resume')).toEqual([]);
    });

    test('well-formed cover letter passes; one without a body is flagged', () => {
        expect(missingMarkers('BODY_PARAGRAPH: Hello there', 'cover_letter')).toEqual([]);
        expect(missingMarkers('HEADER: Jane', 'cover_letter').length).toBeGreaterThan(0);
    });

    test('changes accepts either METRICS or CHANGE', () => {
        expect(missingMarkers('METRICS: added 3 keywords', 'changes')).toEqual([]);
        expect(missingMarkers('CHANGE: reworded summary', 'changes')).toEqual([]);
        expect(missingMarkers('random text', 'changes').length).toBeGreaterThan(0);
    });

    test('empty output is malformed', () => {
        expect(missingMarkers('', 'resume').length).toBeGreaterThan(0);
    });

    test('unknown type is not validated', () => {
        expect(missingMarkers('whatever', 'nope')).toEqual([]);
    });
});
