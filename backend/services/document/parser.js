'use strict';

/**
 * All marker labels the document generators recognise.
 * Order matters: longer/more-specific patterns should come first if needed,
 * but here each is distinct so order is arbitrary.
 */
const RESUME_MARKERS = [
    'NAME',
    'CONTACT',
    'SECTION',
    'SUMMARY_TEXT',
    'COMPANY',
    'TITLE',
    'DESC',
    'BULLET',
    'EDUCATION',
    'SKILL_CATEGORY',
];

const COVER_LETTER_MARKERS = [
    'HEADER',
    'ADDRESS',
    'DATE',
    'EMPLOYER',
    'SUBJECT',
    'BODY_PARAGRAPH',
    'CLOSING',
];

const SPACE_MARKER = 'SPACE';

const ALL_MARKERS = [...RESUME_MARKERS, ...COVER_LETTER_MARKERS, SPACE_MARKER];

// Pre-compile one regex per marker for performance
const MARKER_REGEXES = ALL_MARKERS.map((m) => ({
    type: m.toLowerCase(),
    // Matches optional leading ** or *, the marker label, :, optional trailing ** or *
    re: new RegExp(`^\\*{0,2}${m}:\\s*\\*{0,2}`, 'i'),
}));

const SPACE_RE = /^\*{0,2}SPACE\*{0,2}$/i;

// Markers that are unrecognised (fallback guard)
const KNOWN_MARKER_GUARD = new RegExp(
    `^\\*{0,2}(${ALL_MARKERS.join('|')}):`,
    'i'
);

/**
 * Parses an AI-formatted resume/cover-letter string into an array of tokens.
 *
 * @param {string} content  Raw AI output with NAME:, SECTION:, BULLET: etc.
 * @returns {Array<{type: string, text: string}>}
 *   type  – lowercase marker name, e.g. 'name', 'bullet', 'space', 'paragraph'
 *   text  – extracted text (empty string for SPACE tokens)
 */
function parseDocumentMarkers(content) {
    const lines = content.split('\n');
    const tokens = [];

    // Quick heuristic: does this content even use the marker format?
    const hasMarkers = lines.some(
        (l) =>
            l.includes('NAME:') ||
            l.includes('SECTION:') ||
            l.includes('COMPANY:') ||
            l.includes('TITLE:') ||
            l.includes('BULLET:') ||
            l.includes('EDUCATION:') ||
            l.includes('HEADER:') ||
            l.includes('BODY_PARAGRAPH:')
    );

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // SPACE token has no colon
        if (SPACE_RE.test(trimmed)) {
            tokens.push({ type: 'space', text: '' });
            continue;
        }

        // Try each known marker
        let matched = false;
        for (const { type, re } of MARKER_REGEXES) {
            if (re.test(trimmed)) {
                const text = trimmed.replace(re, '').trim();
                if (text) {
                    tokens.push({ type, text });
                }
                matched = true;
                break;
            }
        }

        if (!matched) {
            // Only emit a paragraph token if the content uses markers
            // (for unstructured content the caller handles it differently)
            if (hasMarkers && !KNOWN_MARKER_GUARD.test(trimmed)) {
                tokens.push({ type: 'paragraph', text: trimmed });
            } else if (!hasMarkers) {
                tokens.push({ type: 'paragraph', text: trimmed });
            }
        }
    }

    return tokens;
}

module.exports = { parseDocumentMarkers, ALL_MARKERS, RESUME_MARKERS, COVER_LETTER_MARKERS };
