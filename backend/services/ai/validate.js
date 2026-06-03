'use strict';

/**
 * Validates that AI output actually uses the expected marker format before it is
 * handed to the document renderers (a malformed response would otherwise flow
 * silently into a broken/empty PDF or DOCX).
 *
 * Each output type has one or more rules. A rule lists candidate markers and a
 * mode:
 *   'all' — every marker must be present
 *   'any' — at least one of them must be present
 */
const RULES = {
    resume: [
        { markers: ['NAME'], mode: 'all' },
        { markers: ['SECTION', 'BULLET', 'COMPANY', 'EDUCATION', 'SUMMARY_TEXT'], mode: 'any' },
    ],
    cover_letter: [{ markers: ['BODY_PARAGRAPH'], mode: 'any' }],
    changes: [{ markers: ['METRICS', 'CHANGE'], mode: 'any' }],
};

// A marker counts as present when it appears as a line prefix, tolerant of
// leading ** (Gemini's markdown bold variant) and surrounding whitespace.
function hasMarker(text, marker) {
    return new RegExp(`^\\s*\\*{0,2}${marker}:`, 'im').test(text);
}

/**
 * Returns the list of missing/absent required markers for the given output type.
 * An empty array means the output is well-formed. Unknown types are not
 * validated (returns []).
 *
 * @param {string} text
 * @param {'resume'|'cover_letter'|'changes'} type
 * @returns {string[]}
 */
function missingMarkers(text, type) {
    const rules = RULES[type];
    if (!rules || typeof text !== 'string') return [];

    const missing = [];
    for (const rule of rules) {
        const present = rule.markers.filter((m) => hasMarker(text, m));
        if (rule.mode === 'all') {
            missing.push(...rule.markers.filter((m) => !present.includes(m)));
        } else if (rule.mode === 'any' && present.length === 0) {
            missing.push(rule.markers.join(' or '));
        }
    }
    return missing;
}

module.exports = { missingMarkers, RULES };
