'use strict';

const { getTodayDate } = require('../../utils/clean');

/**
 * Builds the resume-transformation prompt.
 * OpenAI and Claude use plain markers; Gemini uses **MARKER:** bold syntax.
 *
 * @param {string} resumeText
 * @param {string} jobDescription
 * @param {'plain'|'markdown'} format
 * @returns {string}
 */
function buildResumePrompt(resumeText, jobDescription, format) {
    const m = (label) => format === 'markdown' ? `**${label}:**` : `${label}:`;

    if (format === 'markdown') {
        return `
**Your Task:** Analyze the "Original Resume" and "Job Description" provided below. Your goal is to transform the "Original Resume" into a highly ATS-friendly document. You MUST strictly use the "CRITICAL OUTPUT FORMAT" markers ONCE for each piece of information in your final, generated output.

**Critical Input Handling Instruction:**
- The "Original Resume" text (provided under "Original Resume:") MAY ALREADY CONTAIN formatting markers (e.g., "NAME:", "SECTION:", "BULLET:").
- When you process each line or piece of information from the "Original Resume", you should consider the *content* of that information. If an existing marker is present in the input, treat it as an indicator of the data type for that line, but DO NOT repeat or embed these input markers within the *content* part of YOUR new output lines.
- Your output should apply the "CRITICAL OUTPUT FORMAT" markers cleanly to the processed and optimized content. There should only be ONE valid marker prefixing each relevant line in your final output.

**CRITICAL OUTPUT FORMAT - Use these EXACT prefixes. Each marker should appear only once at the beginning of its respective line:**

${m('NAME')} [Full Name] (This must be the very first line of your output)
${m('CONTACT')} [Email | Phone | LinkedIn | Location] (Single line, use | as a separator if multiple items)
${m('SECTION')} [SECTION NAME] (e.g., SUMMARY, WORK EXPERIENCE, EDUCATION, SKILLS, CERTIFICATIONS)
${m('SUMMARY_TEXT')} [2-4 sentence professional summary, if applicable. Content only, no repeated markers within.]
${m('COMPANY')} [Company Name] | [Location] | [Employment Dates] (Content only after the marker)
${m('TITLE')} [Job Title] (Content only after the marker)
${m('DESC')} [Brief company description, if applicable per guidelines. Content only after the marker.] (Only for non-major companies unless already present in original resume)
${m('BULLET')} • [Achievement/responsibility. The text of the achievement starts after the '• ' and should not contain further 'BULLET:' or '•' prefixes.]
${m('EDUCATION')} [Degree/Certificate Name] | [Institution Name] | [Location] | [Dates/Year, if any] (Content only after the marker)
${m('SKILL_CATEGORY')} [Category Name]: [Comma-separated list of skills] (Content only after the marker)
**SPACE** (Use this marker on its own line where a visual break is desired between major sections or entries)

**Content Customization Guidelines:**
- **Preserve Core Content:** You MUST retain ALL original work experiences, achievements, and dates. Do not remove or summarize them.
- **Optimize Wording:** Rephrase existing content for clarity, impact, and stronger alignment with the "Job Description".
- **Integrate Keywords:** Naturally weave relevant keywords from the "Job Description" into the optimized resume content. Avoid stuffing.
- **Company Descriptions:** Only add "DESC:" lines for non-major/lesser-known companies. If the original resume already includes a description for any company (even well-known ones), retain and optimize that description under the "DESC:" marker.

**Input Data:**

**Original Resume:**
${resumeText}

**Job Description:**
${jobDescription}

**Begin Formatted Output (Ensure every line of actual resume data starts with one of the specified markers, and only that one marker. Do not embed markers within the content of a line.):**
`;
    }

    // Plain format (OpenAI / Claude)
    return `Transform this resume for the job posting using this EXACT format. Each line must start with one of these markers:

NAME: [Full Name]
CONTACT: [Email | Phone | LinkedIn | Location]
SECTION: [SECTION NAME]
SUMMARY_TEXT: [Professional summary]
COMPANY: [Company Name] | [Location] | [Dates]
TITLE: [Job Title]
DESC: [Company description - only for non-major companies]
BULLET: • [Achievement/responsibility]
EDUCATION: [Degree] | [Institution] | [Location] | [Year]
SKILL_CATEGORY: [Category]: [skills]
SPACE (for visual breaks)

Keep ALL experiences and achievements. Only optimize wording and keywords.

Original Resume:
${resumeText}

Job Description:
${jobDescription}

Output:`;
}

/**
 * Builds the cover-letter prompt.
 *
 * @param {string} resumeText
 * @param {string} jobDescription
 * @param {'plain'|'markdown'} format
 * @returns {string}
 */
function buildCoverLetterPrompt(resumeText, jobDescription, format) {
    const todayDate = getTodayDate();
    const m = (label) => format === 'markdown' ? `**${label}:**` : `${label}:`;

    return `Write a professional cover letter using these format markers:

${m('HEADER')} [Full Name]
${m('ADDRESS')} [Email | Phone | City, State]
${m('DATE')} ${todayDate}
${m('EMPLOYER')} [Hiring Manager Name or "Hiring Manager"]
${m('EMPLOYER')} [Company Name]
${m('EMPLOYER')} [Company Address if known]
${m('SUBJECT')} Re: [Position Title] Position

${m('BODY_PARAGRAPH')} [Opening paragraph - express interest and how you learned about the position]

${m('BODY_PARAGRAPH')} [Second paragraph - highlight relevant experience and achievements from resume that match job requirements]

${m('BODY_PARAGRAPH')} [Third paragraph - explain why you're interested in this company/role specifically]

${m('BODY_PARAGRAPH')} [Closing paragraph - reiterate interest and mention next steps]

${m('CLOSING')} Sincerely,
${m('CLOSING')} [Your Name]

Resume: ${resumeText}
Job: ${jobDescription}

${format === 'markdown' ? 'Begin Cover Letter:' : 'Output:'}`;
}

/**
 * Builds the changes-analysis prompt.
 *
 * @param {string} resumeText
 * @param {string} jobDescription
 * @param {'plain'|'markdown'} format
 * @returns {string}
 */
function buildChangesPrompt(resumeText, jobDescription, format) {
    const m = (label) => format === 'markdown' ? `**${label}:**` : `${label}:`;

    return `Analyze the resume optimization and provide a structured summary of changes made.

Format your response EXACTLY like this:

${m('METRICS')} [High-level summary with specific numbers, e.g., "Added 8 job-relevant keywords • Strengthened 12 achievement statements • Enhanced 3 skill sections"]

${m('CHANGE')} [Brief title of first major change]
${m('BEFORE')} [Original text from resume]
${m('AFTER')} [Optimized text in new resume]

${m('CHANGE')} [Brief title of second major change]
${m('BEFORE')} [Original text from resume]
${m('AFTER')} [Optimized text in new resume]

${m('CHANGE')} [Brief title of third major change]
${m('BEFORE')} [Original text from resume]
${m('AFTER')} [Optimized text in new resume]

Only include the 3-5 most impactful changes. Focus on specific text improvements, not general observations.

Original Resume:
${resumeText}

Job Requirements:
${jobDescription}

${format === 'markdown' ? '**Begin structured analysis:**' : 'Provide structured analysis:'}`;
}

/**
 * Builds the job-details extraction prompt: pulls the hiring company and job
 * title out of the posting. Used for accurate metadata/filenames in place of the
 * brittle regex heuristic.
 *
 * @param {string} jobDescription
 * @param {'plain'|'markdown'} format
 * @returns {string}
 */
function buildJobDetailsPrompt(jobDescription, format) {
    const m = (label) => (format === 'markdown' ? `**${label}:**` : `${label}:`);

    return `Identify the hiring company and the job title from the job posting below.

Output EXACTLY these two lines and nothing else — no preamble, no extra text:

${m('COMPANY')} [the hiring company's name, or Unknown]
${m('POSITION')} [the exact job title, or Unknown]

Do not include locations, departments, seniority notes, or commentary — only the
company name and the job title.

Job Posting:
${jobDescription}
`;
}

/**
 * Returns the prompt string for the given type and format.
 *
 * @param {'resume'|'cover_letter'|'changes'|'job_details'} type
 * @param {string} resumeText
 * @param {string} jobDescription
 * @param {'plain'|'markdown'} format
 * @returns {string}
 */
function createPrompt(type, resumeText, jobDescription, format = 'plain') {
    switch (type) {
        case 'resume':
            return buildResumePrompt(resumeText, jobDescription, format);
        case 'cover_letter':
            return buildCoverLetterPrompt(resumeText, jobDescription, format);
        case 'changes':
            return buildChangesPrompt(resumeText, jobDescription, format);
        case 'job_details':
            return buildJobDetailsPrompt(jobDescription, format);
        default:
            throw new Error(`Unknown prompt type: ${type}`);
    }
}

module.exports = { createPrompt };
