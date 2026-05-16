'use strict';

const { parseDocumentMarkers } = require('../services/document/parser');

describe('parseDocumentMarkers', () => {
    test('parses a NAME: token', () => {
        const tokens = parseDocumentMarkers('NAME: John Smith');
        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toEqual({ type: 'name', text: 'John Smith' });
    });

    test('parses a SECTION: token', () => {
        const tokens = parseDocumentMarkers('SECTION: EXPERIENCE');
        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toEqual({ type: 'section', text: 'EXPERIENCE' });
    });

    test('parses a BULLET: token', () => {
        const tokens = parseDocumentMarkers('BULLET: • Led a team of 10 engineers');
        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toEqual({ type: 'bullet', text: '• Led a team of 10 engineers' });
    });

    test('parses a SPACE token (no colon)', () => {
        const tokens = parseDocumentMarkers('SPACE');
        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toEqual({ type: 'space', text: '' });
    });

    test('parses a HEADER: cover letter token', () => {
        const tokens = parseDocumentMarkers('HEADER: Jane Doe');
        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toEqual({ type: 'header', text: 'Jane Doe' });
    });

    test('parses a BODY_PARAGRAPH: token', () => {
        const tokens = parseDocumentMarkers('BODY_PARAGRAPH: I am writing to apply for the position.');
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe('body_paragraph');
        expect(tokens[0].text).toContain('I am writing');
    });

    test('handles bold-wrapped markers (**NAME:**)', () => {
        const tokens = parseDocumentMarkers('**NAME:** Alice Johnson');
        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toEqual({ type: 'name', text: 'Alice Johnson' });
    });

    test('parses mixed resume content into correct token sequence', () => {
        const content = [
            'NAME: Bob Smith',
            'CONTACT: bob@example.com | 555-1234',
            'SECTION: EXPERIENCE',
            'COMPANY: Acme Corp | NYC | 2020-2023',
            'TITLE: Senior Engineer',
            'BULLET: • Built distributed systems',
            'SPACE',
        ].join('\n');

        const tokens = parseDocumentMarkers(content);
        const types = tokens.map((t) => t.type);
        expect(types).toEqual(['name', 'contact', 'section', 'company', 'title', 'bullet', 'space']);
    });

    test('returns empty array for empty content', () => {
        expect(parseDocumentMarkers('')).toEqual([]);
    });

    test('returns empty array for whitespace-only content', () => {
        expect(parseDocumentMarkers('   \n\n   ')).toEqual([]);
    });
});
