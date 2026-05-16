'use strict';

const PDFDocument = require('pdfkit');
const { parseDocumentMarkers } = require('./parser');
const { cleanAIResponse } = require('../../utils/clean');

/**
 * Creates a styled PDF buffer from AI-generated content.
 *
 * @param {string} content   AI output (marker format or plain text)
 * @param {string} _name     Applicant name (reserved for future header use)
 * @param {string} _company  Company name  (reserved for future header use)
 * @param {string} _position Position      (reserved for future header use)
 * @returns {Promise<Buffer>}
 */
function createStyledPDF(content, _name, _company, _position) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            const tokens = parseDocumentMarkers(content);
            const hasMarkers = tokens.some((t) => t.type !== 'paragraph');

            if (hasMarkers) {
                for (const token of tokens) {
                    if (doc.y > 720) doc.addPage();
                    _renderPDFToken(doc, token);
                }
            } else {
                // Fallback: unstructured plain text
                const cleanContent = cleanAIResponse(content)
                    .replace(/\*\*/g, '')
                    .replace(/\*/g, '')
                    .replace(/_{2,}/g, '')
                    .replace(/^_+|_+$/gm, '')
                    .replace(/^#+\s*/gm, '')
                    .replace(/`{1,3}/g, '')
                    .trim();

                for (const line of cleanContent.split('\n').filter((l) => l.trim())) {
                    doc.fontSize(10).font('Helvetica').fillColor('#333333').text(line, { width: 500 });
                    doc.moveDown(0.2);
                }
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

function _renderPDFToken(doc, token) {
    const { type, text } = token;
    switch (type) {
        case 'name':
            doc.fontSize(18).font('Helvetica-Bold').fillColor('#2c5aa0').text(text, { align: 'left' });
            doc.moveDown(0.3);
            break;
        case 'contact':
            doc.fontSize(10).font('Helvetica').fillColor('#555555').text(text);
            doc.moveDown(0.5);
            break;
        case 'section':
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#2c5aa0').text(text.toUpperCase());
            doc.moveDown(0.3);
            break;
        case 'summary_text':
            doc.fontSize(10).font('Helvetica').fillColor('#333333').text(text, { width: 500 });
            doc.moveDown(0.5);
            break;
        case 'company':
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000').text(text);
            doc.moveDown(0.2);
            break;
        case 'title':
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333').text(text);
            doc.moveDown(0.2);
            break;
        case 'desc':
            doc.fontSize(10).font('Helvetica').fillColor('#555555').text(text, { width: 500 });
            doc.moveDown(0.3);
            break;
        case 'bullet':
            doc.fontSize(10).font('Helvetica').fillColor('#333333').text(text, { indent: 20, width: 500, lineGap: 2 });
            doc.moveDown(0.1);
            break;
        case 'education':
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000').text(text);
            doc.moveDown(0.2);
            break;
        case 'skill_category':
            doc.fontSize(10).font('Helvetica').fillColor('#333333').text(text, { width: 500 });
            doc.moveDown(0.15);
            break;
        case 'space':
            doc.moveDown(0.4);
            break;
        // Cover letter markers
        case 'header':
            doc.fontSize(20).font('Helvetica-Bold').fillColor('#1e40af').text(text, { align: 'center' });
            doc.moveDown(0.4);
            break;
        case 'address':
            doc.fontSize(10).font('Helvetica').fillColor('#6b7280').text(text, { align: 'center' });
            doc.moveDown(0.3);
            break;
        case 'date':
            doc.moveDown(0.6);
            doc.fontSize(10).font('Helvetica').fillColor('#374151').text(text, { align: 'left' });
            doc.moveDown(0.6);
            break;
        case 'employer':
            if (text !== 'N/A') {
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text(text, { align: 'left' });
                doc.moveDown(0.1);
            }
            break;
        case 'subject':
            doc.moveDown(0.4);
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e40af').text(text, { align: 'left' });
            doc.moveDown(0.6);
            break;
        case 'body_paragraph':
            doc.fontSize(11).font('Helvetica').fillColor('#1f2937').text(text, { width: 500, align: 'justify', lineGap: 3 });
            doc.moveDown(0.6);
            break;
        case 'closing':
            doc.fontSize(11).font('Helvetica').fillColor('#1f2937').text(text, { align: 'left' });
            doc.moveDown(0.2);
            break;
        default:
            // paragraph fallback
            doc.fontSize(10).font('Helvetica').fillColor('#333333').text(text, { width: 500 });
            doc.moveDown(0.2);
            break;
    }
}

module.exports = { createStyledPDF };
