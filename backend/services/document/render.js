'use strict';

const { parseDocumentMarkers } = require('./parser');

// Strip a leading bullet glyph so renderers can apply their own.
const stripBullet = (text) => text.replace(/^•\s*/, '');

// Remove inline markdown emphasis/backticks for clean plain-text output.
const stripInlineMd = (text) => text.replace(/\*\*/g, '').replace(/`+/g, '');

/**
 * Renders marker-formatted AI output as GitHub-flavored Markdown.
 *
 * @param {string} content
 * @returns {string}
 */
function renderMarkdown(content) {
    const out = [];
    for (const { type, text } of parseDocumentMarkers(content)) {
        switch (type) {
            case 'name':
            case 'header':
                out.push(`# ${text}`, '');
                break;
            case 'contact':
            case 'address':
                out.push(`*${text}*`, '');
                break;
            case 'section':
                out.push(`## ${text}`, '');
                break;
            case 'summary_text':
                out.push(text, '');
                break;
            case 'company':
            case 'education':
                out.push(`**${text}**`);
                break;
            case 'title':
                out.push(`*${text}*`);
                break;
            case 'desc':
                out.push(`> ${text}`);
                break;
            case 'bullet':
            case 'skill_category':
                out.push(`- ${stripBullet(text)}`);
                break;
            case 'space':
                out.push('');
                break;
            case 'date':
                out.push('', text, '');
                break;
            case 'employer':
                if (text !== 'N/A') out.push(text);
                break;
            case 'subject':
                out.push('', `**${text}**`, '');
                break;
            case 'body_paragraph':
                out.push(text, '');
                break;
            case 'closing':
                out.push(text);
                break;
            default:
                out.push(text);
                break;
        }
    }
    return collapse(out);
}

/**
 * Renders marker-formatted AI output as clean, ATS-friendly plain text (markers
 * removed; sections upper-cased; bullets normalized).
 *
 * @param {string} content
 * @returns {string}
 */
function renderPlainText(content) {
    const out = [];
    for (const { type, text } of parseDocumentMarkers(content)) {
        const t = stripInlineMd(text);
        switch (type) {
            case 'name':
            case 'header':
            case 'contact':
            case 'address':
                out.push(t, '');
                break;
            case 'section':
                out.push('', t.toUpperCase(), '');
                break;
            case 'summary_text':
                out.push(t, '');
                break;
            case 'company':
            case 'title':
            case 'desc':
            case 'education':
            case 'skill_category':
                out.push(t);
                break;
            case 'bullet':
                out.push(`• ${stripBullet(t)}`);
                break;
            case 'space':
                out.push('');
                break;
            case 'date':
                out.push('', t, '');
                break;
            case 'employer':
                if (t !== 'N/A') out.push(t);
                break;
            case 'subject':
                out.push('', t, '');
                break;
            case 'body_paragraph':
                out.push(t, '');
                break;
            case 'closing':
                out.push(t);
                break;
            default:
                out.push(t);
                break;
        }
    }
    return collapse(out);
}

// Join lines and collapse runs of 3+ blank lines down to one.
function collapse(lines) {
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

module.exports = { renderMarkdown, renderPlainText };
