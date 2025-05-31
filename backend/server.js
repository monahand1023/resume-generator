const express = require('express');
const multer = require('multer');
const puppeteer = require('puppeteer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const cors = require('cors');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to extract name from resume text
function extractNameFromResume(resumeText) {
    const lines = resumeText.split('\n').filter(line => line.trim());

    // Look for name in first few lines
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i].trim();

        // Skip common headers
        if (line.toLowerCase().includes('resume') ||
            line.toLowerCase().includes('curriculum') ||
            line.toLowerCase().includes('cv')) {
            continue;
        }

        // Look for a line that looks like a name (2-4 words, proper case)
        const words = line.split(/\s+/);
        if (words.length >= 2 && words.length <= 4) {
            const isName = words.every(word =>
                word.length > 1 &&
                word[0] === word[0].toUpperCase() &&
                !/\d/.test(word) && // No numbers
                !word.includes('@') && // No email
                !word.includes('(') // No phone
            );

            if (isName) {
                return line;
            }
        }
    }

    return 'Resume'; // Fallback
}

// Helper function to extract company and position from job description
function extractJobDetails(jobDescription) {
    const lines = jobDescription.split('\n').filter(line => line.trim());

    let company = '';
    let position = '';

    // Look for common patterns
    for (const line of lines.slice(0, 20)) { // Check first 20 lines
        const lower = line.toLowerCase();

        // Look for company name patterns
        if (!company && (
            lower.includes('company') ||
            lower.includes('about us') ||
            lower.includes('organization') ||
            line.length < 50 && /^[A-Z][a-zA-Z\s&.,Inc-]+$/.test(line.trim())
        )) {
            company = line.trim().split(/[:\-]/)[0].trim();
        }

        // Look for position title patterns
        if (!position && (
            lower.includes('position') ||
            lower.includes('role') ||
            lower.includes('job title') ||
            (lower.includes('engineer') || lower.includes('manager') || lower.includes('developer')) &&
            line.length < 80
        )) {
            position = line.trim().split(/[:\-]/)[0].trim();
        }

        if (company && position) break;
    }

    return { company: company || 'Company', position: position || 'Position' };
}

// Improved function to clean AI response and remove commentary
function cleanAIResponse(content) {
    // Split into lines and find where the actual resume content ends
    const lines = content.split('\n');
    const cleanedLines = [];
    let inCommentary = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lower = line.toLowerCase();

        // Detect start of commentary
        if (lower.includes('this revised resume') ||
            lower.includes('this resume') ||
            lower.includes('the resume') ||
            lower.includes('this version') ||
            lower.includes('note:') ||
            lower.includes('key changes') ||
            lower.includes('summary of changes') ||
            (lower.includes('focuses') && lower.includes('relevant')) ||
            (lower.includes('highlights') && lower.includes('experience'))) {
            inCommentary = true;
            break;
        }

        if (!inCommentary && line) {
            cleanedLines.push(lines[i]); // Keep original formatting
        }
    }

    return cleanedLines.join('\n').trim();
}

// Enhanced PDF creation function
// Enhanced PDF creation function
function createStyledPDF(content, name, company, position) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                margin: 50,
                size: 'A4'
            });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            const lines = content.split('\n');

            // Check if content uses marker format
            const hasMarkers = lines.some(line =>
                line.includes('NAME:') || line.includes('SECTION:') ||
                line.includes('COMPANY:') || line.includes('TITLE:') ||
                line.includes('HEADER:') || line.includes('BODY_PARAGRAPH:')
            );

            if (hasMarkers) {
                // Process marker-based format
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    // Check if we need a new page
                    if (doc.y > 720) {
                        doc.addPage();
                    }

                    // Resume markers (existing code)
                    if (trimmed.match(/^\*{0,2}NAME:/)) {
                        const text = trimmed.replace(/^\*{0,2}NAME:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(18)
                                .font('Helvetica-Bold')
                                .fillColor('#2c5aa0')
                                .text(text, { align: 'left' });
                            doc.moveDown(0.3);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}CONTACT:/)) {
                        const text = trimmed.replace(/^\*{0,2}CONTACT:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(10)
                                .font('Helvetica')
                                .fillColor('#555555')
                                .text(text);
                            doc.moveDown(0.5);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}SECTION:/)) {
                        const text = trimmed.replace(/^\*{0,2}SECTION:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(12)
                                .font('Helvetica-Bold')
                                .fillColor('#2c5aa0')
                                .text(text.toUpperCase());
                            doc.moveDown(0.3);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}SUMMARY_TEXT:/)) {
                        const text = trimmed.replace(/^\*{0,2}SUMMARY_TEXT:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(10)
                                .font('Helvetica')
                                .fillColor('#333333')
                                .text(text, { width: 500 });
                            doc.moveDown(0.5);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}COMPANY:/)) {
                        const text = trimmed.replace(/^\*{0,2}COMPANY:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(11)
                                .font('Helvetica-Bold')
                                .fillColor('#000000')
                                .text(text);
                            doc.moveDown(0.2);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}TITLE:/)) {
                        const text = trimmed.replace(/^\*{0,2}TITLE:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(11)
                                .font('Helvetica-Bold')
                                .fillColor('#333333')
                                .text(text);
                            doc.moveDown(0.2);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}DESC:/)) {
                        const text = trimmed.replace(/^\*{0,2}DESC:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(10)
                                .font('Helvetica')
                                .fillColor('#555555')
                                .text(text, { width: 500 });
                            doc.moveDown(0.3);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}BULLET:/)) {
                        const text = trimmed.replace(/^\*{0,2}BULLET:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(10)
                                .font('Helvetica')
                                .fillColor('#333333')
                                .text(text, {
                                    indent: 20,
                                    width: 500,
                                    lineGap: 2
                                });
                            doc.moveDown(0.1);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}EDUCATION:/)) {
                        const text = trimmed.replace(/^\*{0,2}EDUCATION:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(11)
                                .font('Helvetica-Bold')
                                .fillColor('#000000')
                                .text(text);
                            doc.moveDown(0.2);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}SKILL_CATEGORY:/)) {
                        const text = trimmed.replace(/^\*{0,2}SKILL_CATEGORY:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(10)
                                .font('Helvetica')
                                .fillColor('#333333')
                                .text(text, { width: 500 });
                            doc.moveDown(0.15);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}SPACE\*{0,2}$/)) {
                        doc.moveDown(0.4);
                    }
                    // COVER LETTER MARKERS - PROPERLY FORMATTED
                    else if (trimmed.match(/^\*{0,2}HEADER:/)) {
                        const text = trimmed.replace(/^\*{0,2}HEADER:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(16)
                                .font('Helvetica-Bold')
                                .fillColor('#000000')
                                .text(text, { align: 'left' });
                            doc.moveDown(0.3);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}ADDRESS:/)) {
                        const text = trimmed.replace(/^\*{0,2}ADDRESS:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(10)
                                .font('Helvetica')
                                .fillColor('#555555')
                                .text(text, { align: 'left' });
                            doc.moveDown(0.2);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}DATE:/)) {
                        const text = trimmed.replace(/^\*{0,2}DATE:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.moveDown(0.5);
                            doc.fontSize(10)
                                .font('Helvetica')
                                .fillColor('#000000')
                                .text(text);
                            doc.moveDown(0.5);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}EMPLOYER:/)) {
                        const text = trimmed.replace(/^\*{0,2}EMPLOYER:\s*\*{0,2}/, '').trim();
                        if (text && text !== 'N/A') {
                            doc.fontSize(10)
                                .font('Helvetica')
                                .fillColor('#000000')
                                .text(text);
                            doc.moveDown(0.1);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}SUBJECT:/)) {
                        const text = trimmed.replace(/^\*{0,2}SUBJECT:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.moveDown(0.3);
                            doc.fontSize(10)
                                .font('Helvetica')
                                .fillColor('#000000')
                                .text(text);
                            doc.moveDown(0.5);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}BODY_PARAGRAPH:/)) {
                        const text = trimmed.replace(/^\*{0,2}BODY_PARAGRAPH:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(10)
                                .font('Helvetica')
                                .fillColor('#000000')
                                .text(text, {
                                    width: 500,
                                    align: 'left',
                                    lineGap: 2
                                });
                            doc.moveDown(0.5);
                        }
                    }
                    else if (trimmed.match(/^\*{0,2}CLOSING:/)) {
                        const text = trimmed.replace(/^\*{0,2}CLOSING:\s*\*{0,2}/, '').trim();
                        if (text) {
                            doc.fontSize(10)
                                .font('Helvetica')
                                .fillColor('#000000')
                                .text(text);
                            doc.moveDown(0.2);
                        }
                    }
                }
            } else {
                // Fallback to original PDF generation for unstructured content
                const cleanContent = cleanAIResponse(content)
                    .replace(/\*\*/g, '')
                    .replace(/\*/g, '')
                    .replace(/_{2,}/g, '')
                    .replace(/^_+|_+$/gm, '')
                    .replace(/^#+\s*/gm, '')
                    .replace(/`{1,3}/g, '')
                    .trim();

                const cleanLines = cleanContent.split('\n').filter(line => line.trim());

                for (let i = 0; i < cleanLines.length; i++) {
                    const line = cleanLines[i].trim();
                    if (!line) continue;

                    // Basic formatting for unstructured content
                    doc.fontSize(10)
                        .font('Helvetica')
                        .fillColor('#333333')
                        .text(line, { width: 500 });
                    doc.moveDown(0.2);
                }
            }

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

async function createWordDoc(content, title) {
    const lines = content.split('\n');
    const children = [];

    // Check if content uses marker format
    const hasMarkers = lines.some(line =>
        line.includes('NAME:') || line.includes('SECTION:') ||
        line.includes('COMPANY:') || line.includes('TITLE:') ||
        line.includes('BULLET:') || line.includes('EDUCATION:') ||
        line.includes('HEADER:') || line.includes('BODY_PARAGRAPH:')
    );

    if (hasMarkers) {
        // Process marker-based format
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Resume markers (existing)
            if (trimmed.match(/^\*{0,2}NAME:/)) {
                const text = trimmed.replace(/^\*{0,2}NAME:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            bold: true,
                            size: 36,
                            color: "2c5aa0"
                        })],
                        spacing: { after: 200 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}CONTACT:/)) {
                const text = trimmed.replace(/^\*{0,2}CONTACT:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            size: 20,
                            color: "555555"
                        })],
                        spacing: { after: 300 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}SECTION:/)) {
                const text = trimmed.replace(/^\*{0,2}SECTION:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            bold: true,
                            size: 24,
                            color: "2c5aa0"
                        })],
                        spacing: { before: 200, after: 200 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}SUMMARY_TEXT:/)) {
                const text = trimmed.replace(/^\*{0,2}SUMMARY_TEXT:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            size: 20,
                            color: "333333"
                        })],
                        spacing: { after: 200 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}COMPANY:/)) {
                const text = trimmed.replace(/^\*{0,2}COMPANY:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            bold: true,
                            size: 22,
                            color: "000000"
                        })],
                        spacing: { before: 200, after: 100 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}TITLE:/)) {
                const text = trimmed.replace(/^\*{0,2}TITLE:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            bold: true,
                            size: 20,
                            color: "333333"
                        })],
                        spacing: { after: 100 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}DESC:/)) {
                const text = trimmed.replace(/^\*{0,2}DESC:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            size: 18,
                            color: "555555",
                            italics: true
                        })],
                        spacing: { after: 150 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}BULLET:/)) {
                const text = trimmed.replace(/^\*{0,2}BULLET:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            size: 20,
                            color: "333333"
                        })],
                        indent: { left: 200 },
                        spacing: { after: 100 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}EDUCATION:/)) {
                const text = trimmed.replace(/^\*{0,2}EDUCATION:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            bold: true,
                            size: 20,
                            color: "000000"
                        })],
                        spacing: { after: 100 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}SKILL_CATEGORY:/)) {
                const text = trimmed.replace(/^\*{0,2}SKILL_CATEGORY:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            size: 20,
                            color: "333333"
                        })],
                        spacing: { after: 100 }
                    }));
                }
            }
            // COVER LETTER MARKERS - PROPERLY FORMATTED
            else if (trimmed.match(/^\*{0,2}HEADER:/)) {
                const text = trimmed.replace(/^\*{0,2}HEADER:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            bold: true,
                            size: 32,
                            color: "000000"
                        })],
                        spacing: { after: 200 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}ADDRESS:/)) {
                const text = trimmed.replace(/^\*{0,2}ADDRESS:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            size: 20,
                            color: "555555"
                        })],
                        spacing: { after: 100 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}DATE:/)) {
                const text = trimmed.replace(/^\*{0,2}DATE:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: "",
                            size: 20
                        })],
                        spacing: { after: 200 }
                    }));
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            size: 20,
                            color: "000000"
                        })],
                        spacing: { after: 300 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}EMPLOYER:/)) {
                const text = trimmed.replace(/^\*{0,2}EMPLOYER:\s*\*{0,2}/, '').trim();
                if (text && text !== 'N/A') {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            size: 20,
                            color: "000000"
                        })],
                        spacing: { after: 50 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}SUBJECT:/)) {
                const text = trimmed.replace(/^\*{0,2}SUBJECT:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: "",
                            size: 20
                        })],
                        spacing: { after: 100 }
                    }));
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            size: 20,
                            color: "000000"
                        })],
                        spacing: { after: 300 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}BODY_PARAGRAPH:/)) {
                const text = trimmed.replace(/^\*{0,2}BODY_PARAGRAPH:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            size: 20,
                            color: "000000"
                        })],
                        spacing: { after: 300 },
                        alignment: "left"
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}CLOSING:/)) {
                const text = trimmed.replace(/^\*{0,2}CLOSING:\s*\*{0,2}/, '').trim();
                if (text) {
                    children.push(new Paragraph({
                        children: [new TextRun({
                            text: text,
                            size: 20,
                            color: "000000"
                        })],
                        spacing: { after: 100 }
                    }));
                }
            }
            else if (trimmed.match(/^\*{0,2}SPACE\*{0,2}$/)) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: "" })],
                    spacing: { after: 300 }
                }));
            }
            // Any line that doesn't start with a known marker
            else if (!trimmed.match(/^(\*{0,2})(NAME|CONTACT|SECTION|SUMMARY_TEXT|COMPANY|TITLE|DESC|BULLET|EDUCATION|SKILL_CATEGORY|HEADER|ADDRESS|DATE|EMPLOYER|SUBJECT|BODY_PARAGRAPH|CLOSING|SPACE):/)) {
                children.push(new Paragraph({
                    children: [new TextRun({
                        text: trimmed,
                        size: 20,
                        color: "333333"
                    })],
                    spacing: { after: 100 }
                }));
            }
        }
    } else {
        // Process unstructured content from OpenAI/Claude
        const paragraphs = content.split('\n\n');

        for (const paragraph of paragraphs) {
            const trimmed = paragraph.trim();
            if (!trimmed) continue;

            // Clean up any formatting artifacts
            const cleanText = trimmed
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/_{2,}/g, '')
                .replace(/^_+|_+$/gm, '')
                .replace(/^#+\s*/gm, '')
                .replace(/`{1,3}/g, '');

            children.push(new Paragraph({
                children: [new TextRun({
                    text: cleanText,
                    size: 20
                })],
                spacing: { after: 200 }
            }));
        }
    }

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
                }
            },
            children: children
        }]
    });

    return await Packer.toBuffer(doc);
}

async function scrapeJobDescription(url) {
    const browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: 'new'
    });

    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0' });

        const content = await page.evaluate(() => {
            const scripts = document.querySelectorAll('script, style');
            scripts.forEach(el => el.remove());
            return document.body.innerText;
        });

        return content;
    } finally {
        await browser.close();
    }
}

async function parseResumeFile(fileBuffer) {
    const uint8Array = new Uint8Array(fileBuffer);

    // Check if PDF
    if (uint8Array[0] === 0x25 && uint8Array[1] === 0x50 && uint8Array[2] === 0x44 && uint8Array[3] === 0x46) {
        const data = await pdfParse(fileBuffer);
        return data.text;
    }

    // Try Word document
    try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return result.value;
    } catch (error) {
        throw new Error('Unable to parse resume file. Please upload a PDF or Word document.');
    }
}

async function customizeWithOpenAI(resumeText, jobDescription, apiKey, type) {
    const prompts = {
        resume: `Transform this resume for the job posting using this EXACT format. Each line must start with one of these markers:

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

Output:`,
        cover_letter: `Write a professional cover letter using these format markers:

HEADER: [Full Name]
ADDRESS: [Email | Phone | City, State]
DATE: [Today's date]
EMPLOYER: [Hiring Manager Name or "Hiring Manager"]
EMPLOYER: [Company Name]
EMPLOYER: [Company Address if known]
SUBJECT: Re: [Position Title] Position

BODY_PARAGRAPH: [Opening paragraph - express interest and how you learned about the position]

BODY_PARAGRAPH: [Second paragraph - highlight relevant experience and achievements from resume that match job requirements]

BODY_PARAGRAPH: [Third paragraph - explain why you're interested in this company/role specifically]

BODY_PARAGRAPH: [Closing paragraph - reiterate interest and mention next steps]

CLOSING: Sincerely,
CLOSING: [Your Name]

Resume: ${resumeText}
Job: ${jobDescription}

Output:`,
        changes: `List key optimizations made. Format as bulleted list.

Original Resume:
${resumeText}

Job Requirements:
${jobDescription}

Key Changes Made:`
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompts[type] }],
            max_tokens: 2000,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

async function customizeWithGemini(resumeText, jobDescription, apiKey, type) {
    const prompts = {
        resume: `
**Your Task:** Analyze the "Original Resume" and "Job Description" provided below. Your goal is to transform the "Original Resume" into a highly ATS-friendly document. You MUST strictly use the "CRITICAL OUTPUT FORMAT" markers ONCE for each piece of information in your final, generated output.

**Critical Input Handling Instruction:**
- The "Original Resume" text (provided under "Original Resume:") MAY ALREADY CONTAIN formatting markers (e.g., "NAME:", "SECTION:", "BULLET:").
- When you process each line or piece of information from the "Original Resume", you should consider the *content* of that information. If an existing marker is present in the input, treat it as an indicator of the data type for that line, but DO NOT repeat or embed these input markers within the *content* part of YOUR new output lines.
- Your output should apply the "CRITICAL OUTPUT FORMAT" markers cleanly to the processed and optimized content. There should only be ONE valid marker prefixing each relevant line in your final output.

**CRITICAL OUTPUT FORMAT - Use these EXACT prefixes. Each marker should appear only once at the beginning of its respective line:**

**NAME:** [Full Name] (This must be the very first line of your output)
**CONTACT:** [Email | Phone | LinkedIn | Location] (Single line, use | as a separator if multiple items)
**SECTION:** [SECTION NAME] (e.g., SUMMARY, WORK EXPERIENCE, EDUCATION, SKILLS, CERTIFICATIONS)
**SUMMARY_TEXT:** [2-4 sentence professional summary, if applicable. Content only, no repeated markers within.]
**COMPANY:** [Company Name] | [Location] | [Employment Dates] (Content only after the marker)
**TITLE:** [Job Title] (Content only after the marker)
**DESC:** [Brief company description, if applicable per guidelines. Content only after the marker.] (Only for non-major companies unless already present in original resume)
**BULLET:** • [Achievement/responsibility. The text of the achievement starts after the '• ' and should not contain further 'BULLET:' or '•' prefixes.]
**EDUCATION:** [Degree/Certificate Name] | [Institution Name] | [Location] | [Dates/Year, if any] (Content only after the marker)
**SKILL_CATEGORY:** [Category Name]: [Comma-separated list of skills] (Content only after the marker)
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
`,
        // Your cover_letter and changes prompts remain the same as you had them
        cover_letter: `Write a professional cover letter. Use these format markers:

**HEADER:** [Full Name]
**ADDRESS:** [Email | Phone | City, State]
**DATE:** [Today's date]
**EMPLOYER:** [Hiring Manager Name or "Hiring Manager"]
**EMPLOYER:** [Company Name]
**EMPLOYER:** [Company Address if known]
**SUBJECT:** Re: [Position Title] Position

**BODY_PARAGRAPH:** [Opening paragraph - express interest and how you learned about the position]

**BODY_PARAGRAPH:** [Second paragraph - highlight relevant experience and achievements from resume that match job requirements]

**BODY_PARAGRAPH:** [Third paragraph - explain why you're interested in this company/role specifically]

**BODY_PARAGRAPH:** [Closing paragraph - reiterate interest and mention next steps]

**CLOSING:** Sincerely,
**CLOSING:** [Your Name]

Resume: ${resumeText}
Job: ${jobDescription}

Begin Cover Letter:`,
        changes: `Compare the original resume with the job requirements and list the key optimizations you would make. Be specific about keyword additions, rephrasing, and emphasis changes.

Format as a concise bulleted list of changes:
• [Specific change made and why]

**Original Resume:**
${resumeText}

**Job Requirements:**
${jobDescription}

**Key Changes Made:`
    };

    const modelName = 'gemini-1.5-pro-latest';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const requestBody = {
        contents: [{
            parts: [{
                text: prompts[type]
            }]
        }],
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 8000
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        let errorDetails = `Status: ${response.status}, StatusText: ${response.statusText}`;
        try {
            const errorData = await response.json();
            errorDetails += `, Response: ${JSON.stringify(errorData)}`;
        } catch (e) {
            const textError = await response.text();
            errorDetails += `, Response (raw): ${textError}`;
        }
        console.error('Gemini API Error:', errorDetails);
        const err = new Error(`Gemini API request failed. ${errorDetails}`);
        err.status = response.status;
        throw err;
    }

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0 &&
        data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0 &&
        typeof data.candidates[0].content.parts[0].text === 'string') {
        return data.candidates[0].content.parts[0].text;
    } else if (data.promptFeedback && data.promptFeedback.blockReason) {
        const blockReason = data.promptFeedback.blockReason;
        const safetyRatings = JSON.stringify(data.promptFeedback.safetyRatings || 'No specific ratings provided.');
        console.error(`Gemini content blocked. Reason: ${blockReason}, Ratings: ${safetyRatings}`);
        throw new Error(`Your request was blocked by Gemini's safety filters. Reason: ${blockReason}. Please revise your input or check safety settings.`);
    } else {
        console.warn("Gemini response structure unexpected, empty, or text part missing:", JSON.stringify(data));
        throw new Error('Gemini API returned an unexpected, empty, or improperly formatted response structure.');
    }
}

async function customizeWithClaude(resumeText, jobDescription, apiKey, type) {
    const prompts = {
        resume: `Transform this resume for the job using this EXACT format:

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

Keep ALL experiences. Only optimize wording and keywords.

Resume:
${resumeText}

Job:
${jobDescription}

Output:`,
        cover_letter: `Write a professional cover letter using these markers:

HEADER: [Full Name]
ADDRESS: [Email | Phone | City, State]
DATE: [Today's date]
EMPLOYER: [Hiring Manager Name or "Hiring Manager"]
EMPLOYER: [Company Name]
EMPLOYER: [Company Address if known]
SUBJECT: Re: [Position Title] Position

BODY_PARAGRAPH: [Opening paragraph - express interest and how you learned about the position]

BODY_PARAGRAPH: [Second paragraph - highlight relevant experience and achievements from resume that match job requirements]

BODY_PARAGRAPH: [Third paragraph - explain why you're interested in this company/role specifically]

BODY_PARAGRAPH: [Closing paragraph - reiterate interest and mention next steps]

CLOSING: Sincerely,
CLOSING: [Your Name]

Resume: ${resumeText}
Job: ${jobDescription}

Output:`,
        changes: `List key optimizations as bullets.

Original Resume:
${resumeText}

Job Requirements:
${jobDescription}

Key Changes Made:`
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-3-sonnet-20240229',
            max_tokens: 3000,
            messages: [{
                role: 'user',
                content: prompts[type]
            }]
        })
    });

    if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
}

function createPDF(content, title) {
    // Just use the same marker-aware function
    return createStyledPDF(content, '', '', '');
}

app.post('/api/customize-resume', upload.single('resume'), async (req, res) => {
    try {
        const { jobUrl, apiKey, provider } = req.body;
        const resume = req.file?.buffer;

        if (!jobUrl || !apiKey || !resume || !provider) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const jobDescription = await scrapeJobDescription(jobUrl);
        const resumeText = await parseResumeFile(resume);

        // Extract metadata for better file naming
        const name = extractNameFromResume(resumeText);
        const jobDetails = extractJobDetails(jobDescription);

        let customizeFunction;
        if (provider === 'openai') {
            customizeFunction = customizeWithOpenAI;
        } else if (provider === 'gemini') {
            customizeFunction = customizeWithGemini;
        } else if (provider === 'claude') {
            customizeFunction = customizeWithClaude;
        } else {
            return res.status(400).json({ error: 'Invalid provider' });
        }

        // Generate all three outputs
        const [customizedResume, coverLetter, changes] = await Promise.all([
            customizeFunction(resumeText, jobDescription, apiKey, 'resume'),
            customizeFunction(resumeText, jobDescription, apiKey, 'cover_letter'),
            customizeFunction(resumeText, jobDescription, apiKey, 'changes')
        ]);

        res.json({
            resume: customizedResume,
            coverLetter: coverLetter,
            changes: changes,
            metadata: {
                name: name,
                company: jobDetails.company,
                position: jobDetails.position
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/format-document', async (req, res) => {
    try {
        const { content, format, filename, metadata } = req.body;

        if (!content || !format || !filename) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let buffer;
        let contentType;
        let fileExtension;

        if (format === 'pdf') {
            const name = metadata?.name || 'Resume';
            const company = metadata?.company || '';
            const position = metadata?.position || '';

            buffer = await createStyledPDF(content, name, company, position);
            contentType = 'application/pdf';
            fileExtension = 'pdf';
        } else if (format === 'docx') {
            buffer = await createWordDoc(content, filename);
            contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            fileExtension = 'docx';
        } else {
            return res.status(400).json({ error: 'Unsupported format' });
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.${fileExtension}"`);
        res.send(buffer);

    } catch (error) {
        console.error('Error formatting document:', error);
        res.status(500).json({ error: 'Failed to format document' });
    }
});

// Serve React app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});