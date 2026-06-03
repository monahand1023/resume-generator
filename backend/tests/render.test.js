'use strict';

const { renderMarkdown, renderPlainText } = require('../services/document/render');

const RESUME = [
    'NAME: Jane Doe',
    'CONTACT: jane@example.com | 555-1234',
    'SECTION: SUMMARY',
    'SUMMARY_TEXT: Did things.',
    'COMPANY: Acme | NYC | 2020-2023',
    'TITLE: Engineer',
    'BULLET: • Built X',
    'SKILL_CATEGORY: Languages: Go, JS',
].join('\n');

describe('renderMarkdown', () => {
    test('produces headings and bullets with no raw markers', () => {
        const md = renderMarkdown(RESUME);
        expect(md).toContain('# Jane Doe');
        expect(md).toContain('## SUMMARY');
        expect(md).toContain('- Built X');
        expect(md).not.toMatch(/^NAME:/m);
        expect(md).not.toMatch(/BULLET:/);
    });
});

describe('renderPlainText', () => {
    test('strips markers, upper-cases sections, normalizes bullets', () => {
        const txt = renderPlainText(RESUME);
        expect(txt).toContain('Jane Doe');
        expect(txt).toContain('SUMMARY');
        expect(txt).toContain('• Built X');
        expect(txt).not.toMatch(/NAME:/);
        expect(txt).not.toMatch(/SKILL_CATEGORY:/);
    });

    test('strips inline markdown bold', () => {
        const txt = renderPlainText('BODY_PARAGRAPH: I am **very** keen');
        expect(txt).toContain('I am very keen');
        expect(txt).not.toContain('**');
    });
});
