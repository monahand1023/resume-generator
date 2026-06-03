'use strict';

/**
 * Removes AI commentary that appears after the resume/cover-letter content.
 * Looks for known commentary-start phrases and discards everything from that
 * line onward.
 *
 * @param {string} content  Raw AI output
 * @returns {string}        Cleaned content
 */
function cleanAIResponse(content) {
    const lines = content.split('\n');
    const cleanedLines = [];

    for (const line of lines) {
        const lower = line.trim().toLowerCase();

        if (
            lower.includes('this revised resume') ||
            lower.includes('this resume') ||
            lower.includes('the resume') ||
            lower.includes('this version') ||
            lower.includes('note:') ||
            lower.includes('key changes') ||
            lower.includes('summary of changes') ||
            (lower.includes('focuses') && lower.includes('relevant')) ||
            (lower.includes('highlights') && lower.includes('experience'))
        ) {
            break;
        }

        if (line.trim()) {
            cleanedLines.push(line);
        }
    }

    return cleanedLines.join('\n').trim();
}

/**
 * Attempts to extract the applicant's name from the first few lines of a
 * resume text.  Returns 'Resume' as a safe fallback.
 *
 * @param {string} resumeText
 * @returns {string}
 */
function extractNameFromResume(resumeText) {
    const lines = resumeText.split('\n').filter((l) => l.trim());

    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i].trim();

        if (
            line.toLowerCase().includes('resume') ||
            line.toLowerCase().includes('curriculum') ||
            line.toLowerCase().includes('cv')
        ) {
            continue;
        }

        const words = line.split(/\s+/);
        if (words.length >= 2 && words.length <= 4) {
            const isName = words.every(
                (w) =>
                    w.length > 1 &&
                    w[0] === w[0].toUpperCase() &&
                    !/\d/.test(w) &&
                    !w.includes('@') &&
                    !w.includes('(')
            );
            if (isName) return line;
        }
    }

    return 'Resume';
}

/**
 * Attempts to extract company and position from the first 20 lines of a job
 * description.  Returns safe fallbacks if not found.
 *
 * @param {string} jobDescription
 * @returns {{ company: string, position: string }}
 */
// Nav/boilerplate lines (job-board chrome) that should never be mistaken for a
// company or job title.
const BOILERPLATE_RE = /^(back to jobs|apply|share|save|sign in|log in|home|menu|search|jobs)\b/i;

// A real company name or job title is short; reject longer candidates so a
// run-on paragraph never becomes the "position".
function candidate(line) {
    const t = line.trim().split(/[:-]/)[0].trim();
    return t && t.length <= 60 ? t : '';
}

function extractJobDetails(jobDescription) {
    const lines = jobDescription.split('\n').filter((l) => l.trim());
    let company = '';
    let position = '';

    for (const line of lines.slice(0, 20)) {
        if (BOILERPLATE_RE.test(line.trim())) continue;
        const lower = line.toLowerCase();

        if (
            !company &&
            (lower.includes('company') ||
                lower.includes('about us') ||
                lower.includes('organization') ||
                (line.length < 50 && /^[A-Z][a-zA-Z\s&.,Inc-]+$/.test(line.trim())))
        ) {
            company = candidate(line);
        }

        if (
            !position &&
            (lower.includes('position') ||
                lower.includes('role') ||
                lower.includes('job title') ||
                ((lower.includes('engineer') ||
                    lower.includes('manager') ||
                    lower.includes('developer')) &&
                    line.length < 80))
        ) {
            position = candidate(line);
        }

        if (company && position) break;
    }

    return { company: company || 'Company', position: position || 'Position' };
}

// Pulls the text after a `MARKER:` line (tolerant of markdown **bold**).
function markerValue(text, marker) {
    const m = new RegExp(`^\\s*\\*{0,2}${marker}:\\s*\\*{0,2}(.+)$`, 'im').exec(text || '');
    return m ? m[1].replace(/\*\*/g, '').trim() : '';
}

// Rejects empty, placeholder, or implausibly-long extracted values.
function saneValue(s) {
    const t = (s || '').trim();
    if (!t || t.includes('[') || t.includes(']') || t.length > 80) return '';
    if (/^(unknown|n\/?a|none|not\b)/i.test(t)) return '';
    return t;
}

/**
 * Parses `COMPANY:` / `POSITION:` from AI extraction output into a
 * { company, position } object. Unusable values become empty strings.
 *
 * @param {string|null} aiRaw
 * @returns {{ company: string, position: string }}
 */
function parseJobDetails(aiRaw) {
    return {
        company: saneValue(markerValue(aiRaw, 'COMPANY')),
        position: saneValue(markerValue(aiRaw, 'POSITION')),
    };
}

/**
 * Resolves the job's company and position, preferring the AI extraction output
 * and falling back per-field to the regex heuristic (and finally its defaults).
 *
 * @param {string|null} aiRaw          Output of a `job_details` AI call
 * @param {string} jobDescription      Scraped job description (heuristic fallback)
 * @returns {{ company: string, position: string }}
 */
function resolveJobDetails(aiRaw, jobDescription) {
    const ai = parseJobDetails(aiRaw);
    const heuristic = extractJobDetails(jobDescription);
    return {
        company: ai.company || heuristic.company,
        position: ai.position || heuristic.position,
    };
}

/**
 * Returns today's date as a human-readable string, e.g. "May 16, 2026".
 *
 * @returns {string}
 */
function getTodayDate() {
    const today = new Date();
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return `${months[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
}

/**
 * Strips characters that are problematic in HTTP Content-Disposition filenames.
 *
 * @param {string} str
 * @returns {string}
 */
function sanitizeFilename(str) {
    return String(str)
        .replace(/[^\x20-\x7E]/g, '')
        // eslint-disable-next-line no-control-regex -- intentionally strip control chars from filenames
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        .replace(/["\\]/g, '')
        .trim()
        .substring(0, 100);
}

module.exports = {
    cleanAIResponse,
    extractNameFromResume,
    extractJobDetails,
    parseJobDetails,
    resolveJobDetails,
    getTodayDate,
    sanitizeFilename,
};
