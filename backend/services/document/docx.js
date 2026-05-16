'use strict';

const { Document, Packer, Paragraph, TextRun } = require('docx');
const { parseDocumentMarkers } = require('./parser');

/**
 * Creates a .docx buffer from AI-generated content.
 *
 * @param {string} content  AI output (marker format or plain text)
 * @param {string} _title   Document title (reserved)
 * @returns {Promise<Buffer>}
 */
async function createWordDoc(content, _title) {
    const children = [];
    const tokens = parseDocumentMarkers(content);
    const hasMarkers = tokens.some((t) => t.type !== 'paragraph');

    if (hasMarkers) {
        for (const token of tokens) {
            const node = _buildDocxParagraph(token);
            if (!node) continue;
            // Some tokens (date, subject) return an array of paragraphs
            if (Array.isArray(node)) {
                children.push(...node);
            } else {
                children.push(node);
            }
        }
    } else {
        // Unstructured fallback
        for (const paragraph of content.split('\n\n')) {
            const trimmed = paragraph.trim();
            if (!trimmed) continue;
            const cleanText = trimmed
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/_{2,}/g, '')
                .replace(/^_+|_+$/gm, '')
                .replace(/^#+\s*/gm, '')
                .replace(/`{1,3}/g, '');

            children.push(
                new Paragraph({
                    children: [new TextRun({ text: cleanText, size: 20 })],
                    spacing: { after: 200 },
                })
            );
        }
    }

    const doc = new Document({
        sections: [{
            properties: {
                page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
            },
            children,
        }],
    });

    return Packer.toBuffer(doc);
}

function _buildDocxParagraph(token) {
    const { type, text } = token;
    switch (type) {
        case 'name':
            return new Paragraph({
                children: [new TextRun({ text, bold: true, size: 36, color: '2c5aa0' })],
                spacing: { after: 200 },
            });
        case 'contact':
            return new Paragraph({
                children: [new TextRun({ text, size: 20, color: '555555' })],
                spacing: { after: 300 },
            });
        case 'section':
            return new Paragraph({
                children: [new TextRun({ text, bold: true, size: 24, color: '2c5aa0' })],
                spacing: { before: 200, after: 200 },
            });
        case 'summary_text':
            return new Paragraph({
                children: [new TextRun({ text, size: 20, color: '333333' })],
                spacing: { after: 200 },
            });
        case 'company':
            return new Paragraph({
                children: [new TextRun({ text, bold: true, size: 22, color: '000000' })],
                spacing: { before: 200, after: 100 },
            });
        case 'title':
            return new Paragraph({
                children: [new TextRun({ text, bold: true, size: 20, color: '333333' })],
                spacing: { after: 100 },
            });
        case 'desc':
            return new Paragraph({
                children: [new TextRun({ text, size: 18, color: '555555', italics: true })],
                spacing: { after: 150 },
            });
        case 'bullet':
            return new Paragraph({
                children: [new TextRun({ text, size: 20, color: '333333' })],
                indent: { left: 200 },
                spacing: { after: 100 },
            });
        case 'education':
            return new Paragraph({
                children: [new TextRun({ text, bold: true, size: 20, color: '000000' })],
                spacing: { after: 100 },
            });
        case 'skill_category':
            return new Paragraph({
                children: [new TextRun({ text, size: 20, color: '333333' })],
                spacing: { after: 100 },
            });
        case 'space':
            return new Paragraph({
                children: [new TextRun({ text: '' })],
                spacing: { after: 300 },
            });
        // Cover letter markers
        case 'header':
            return new Paragraph({
                children: [new TextRun({ text, bold: true, size: 40, color: '1e40af' })],
                spacing: { after: 240 },
                alignment: 'center',
            });
        case 'address':
            return new Paragraph({
                children: [new TextRun({ text, size: 20, color: '6b7280' })],
                spacing: { after: 180 },
                alignment: 'center',
            });
        case 'date':
            // Spacer + date line
            return [
                new Paragraph({
                    children: [new TextRun({ text: '', size: 20 })],
                    spacing: { after: 240 },
                }),
                new Paragraph({
                    children: [new TextRun({ text, size: 20, color: '374151' })],
                    spacing: { after: 360 },
                }),
            ];
        case 'employer':
            if (text === 'N/A') return null;
            return new Paragraph({
                children: [new TextRun({ text, bold: true, size: 20, color: '1f2937' })],
                spacing: { after: 60 },
            });
        case 'subject':
            return [
                new Paragraph({
                    children: [new TextRun({ text: '', size: 20 })],
                    spacing: { after: 240 },
                }),
                new Paragraph({
                    children: [new TextRun({ text, bold: true, size: 22, color: '1e40af' })],
                    spacing: { after: 360 },
                }),
            ];
        case 'body_paragraph':
            return new Paragraph({
                children: [new TextRun({ text, size: 22, color: '1f2937' })],
                spacing: { after: 360, line: 276 },
                alignment: 'both',
            });
        case 'closing':
            return new Paragraph({
                children: [new TextRun({ text, size: 22, color: '1f2937' })],
                spacing: { after: 120 },
            });
        default:
            return new Paragraph({
                children: [new TextRun({ text, size: 20, color: '333333' })],
                spacing: { after: 100 },
            });
    }
}

module.exports = { createWordDoc };
