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

            // Clean the content and remove markdown artifacts
            const cleanContent = cleanAIResponse(content)
                .replace(/\*\*/g, '') // Remove ** bold markers
                .replace(/\*/g, '') // Remove * markers
                .replace(/_{2,}/g, '') // Remove multiple underscores
                .replace(/^_+|_+$/gm, '') // Remove leading/trailing underscores
                .replace(/^#+\s*/gm, '') // Remove # headers
                .replace(/`{1,3}/g, '') // Remove code markers
                .trim();

            const lines = cleanContent.split('\n').filter(line => line.trim());

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                if (!line) continue;

                // Check if we need a new page
                if (doc.y > 720) {
                    doc.addPage();
                }

                // Name at top (first non-empty line)
                if (i === 0) {
                    doc.fontSize(18)
                        .font('Helvetica-Bold')
                        .fillColor('#2c5aa0')
                        .text(line, { align: 'left' });
                    doc.moveDown(0.3);

                    // Contact info line
                } else if (line.includes('@') || line.includes('linkedin') || line.includes('github')) {
                    doc.fontSize(10)
                        .font('Helvetica')
                        .fillColor('#555555')
                        .text(line);
                    doc.moveDown(0.5);

                    // Section headers (WORK EXPERIENCE, EDUCATION, etc.) and Summary
                } else if (line.match(/^(WORK EXPERIENCE|EDUCATION|CERTIFICATIONS|KEY SKILLS|SUMMARY)$/i)) {
                    doc.fontSize(12)
                        .font('Helvetica-Bold')
                        .fillColor('#2c5aa0')
                        .text(line.toUpperCase());
                    doc.moveDown(0.3);

                    // Summary paragraph (after Summary header)
                } else if (i > 0 && lines[i-1].match(/SUMMARY/i) && line.length > 50) {
                    doc.fontSize(10)
                        .font('Helvetica')
                        .fillColor('#333333')
                        .text(line, { width: 500 });
                    doc.moveDown(0.5); // Extra space after summary

                    // Company with location and dates on same line - improved date detection
                } else if (line.includes('Seattle, WA') || line.includes('Tokyo, Japan') || line.includes('Evanston, IL') ||
                    (line.includes('|') && (line.includes('202') || line.includes('201') || line.includes('/20') || line.includes('- 20')))) {
                    // Parse company, location, title, dates
                    const parts = line.split('|').map(p => p.trim());
                    if (parts.length >= 3) {
                        // Company and location
                        doc.fontSize(11)
                            .font('Helvetica-Bold')
                            .fillColor('#000000')
                            .text(parts[0], { continued: true })
                            .font('Helvetica')
                            .text(' | ' + parts[1], { continued: true })
                            .text(' | ' + parts[2]);
                    } else {
                        doc.fontSize(11)
                            .font('Helvetica-Bold')
                            .fillColor('#000000')
                            .text(line);
                    }
                    doc.moveDown(0.2);

                    // Job titles (without company info)
                } else if (line.includes('Engineering Manager') || line.includes('Software Development Manager') ||
                    line.includes('Manager,') ||
                    (i > 0 && lines[i-1].includes('Seattle, WA') && !line.startsWith('•'))) {
                    doc.fontSize(11)
                        .font('Helvetica-Bold')
                        .fillColor('#333333')
                        .text(line);
                    doc.moveDown(0.2);

                    // Company descriptions (any longer paragraph after job title)
                } else if (line.length > 80 && !line.startsWith('•') && !line.startsWith('*') &&
                    i > 0 && (lines[i-1].includes('Engineering Manager') || lines[i-1].includes('Software Development Manager') ||
                        lines[i-1].includes('Manager,') || lines[i-1].includes('Seattle, WA') || lines[i-1].includes('Tokyo, Japan'))) {
                    doc.fontSize(10)
                        .font('Helvetica')
                        .fillColor('#555555')
                        .text(line, { width: 500 });
                    doc.moveDown(0.3);

                    // Work experience items - convert to bullets if not already
                } else if ((lines[i-1] && (lines[i-1].includes('Engineering Manager') || lines[i-1].includes('Software Development Manager'))) ||
                    (line.length > 30 && !line.startsWith('•') && !line.startsWith('*') &&
                        (line.includes('Led') || line.includes('Managed') || line.includes('Developed') ||
                            line.includes('Implemented') || line.includes('Founded') || line.includes('Delivered') ||
                            line.includes('Spearheaded') || line.includes('Defined') || line.includes('Architected') ||
                            line.includes('Established') || line.includes('Transformed') || line.includes('Authored')))) {
                    doc.fontSize(10)
                        .font('Helvetica')
                        .fillColor('#333333')
                        .text('• ' + line, {
                            indent: 20,
                            width: 500,
                            lineGap: 2
                        });
                    doc.moveDown(0.1);

                    // Bullet points
                } else if (line.startsWith('•') || line.startsWith('*')) {
                    const bulletText = line.replace(/^[•*]\s*/, '');
                    doc.fontSize(10)
                        .font('Helvetica')
                        .fillColor('#333333')
                        .text('• ' + bulletText, {
                            indent: 20,
                            width: 500,
                            lineGap: 2
                        });
                    doc.moveDown(0.1);

                    // Education entries
                } else if (line.includes('University') || line.includes('MIT') || line.includes('Bachelor') || line.includes('Massachusetts')) {
                    doc.fontSize(11)
                        .font('Helvetica-Bold')
                        .fillColor('#000000')
                        .text(line);
                    doc.moveDown(0.2);

                    // Regular text/certifications
                } else {
                    doc.fontSize(10)
                        .font('Helvetica')
                        .fillColor('#333333')
                        .text(line, { width: 500 });
                    doc.moveDown(0.15);
                }

                // Add extra space after company sections
                if (line.includes('Amazon Japan') || line.includes('Tokyo, Japan')) {
                    doc.moveDown(0.4);
                }
            }

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
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
        resume: `Customize this resume for the job posting. Focus on relevant skills and keywords from the job description. Keep the same general format but optimize content for this specific role. Return ONLY the customized resume content without any commentary or explanation.\n\nOriginal Resume:\n${resumeText}\n\nJob Description:\n${jobDescription}\n\nCustomized Resume:`,
        cover_letter: `Write a professional cover letter based on this resume and job description. Return ONLY the cover letter content without any commentary.\n\nResume:\n${resumeText}\n\nJob Description:\n${jobDescription}\n\nCover Letter:`
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
        resume: `Customize this resume for the job. Focus on relevant skills and keywords. IMPORTANT: Keep ALL work experience, achievements, and dates. Do not remove or summarize any job experiences - preserve all bullet points and accomplishments. Only optimize wording and emphasize relevant skills.

For companies that are not widely known (like startups or smaller companies), include a brief 1-2 line company description. Skip descriptions for well-known companies like Amazon, Google, Microsoft, Meta, etc.

FORMAT REQUIREMENTS - Use these exact prefixes for easy parsing:
- Company lines: "COMPANY: [Company Name] [Location] • [Dates]"  
- Job titles: "TITLE: [Job Title]"
- Company descriptions: "DESC: [Description]"
- All work achievements: Start with "• [Achievement]"
- Section headers: Use ALL CAPS (WORK EXPERIENCE, EDUCATION, etc.)

Resume:\n${resumeText}\n\nJob:\n${jobDescription}\n\nCustomized resume:`,
        cover_letter: `Write a professional, compelling, and concise cover letter based on this resume and job description. Highlight the most relevant skills and experiences. Tailor the letter specifically to the job, expressing genuine interest.\n\nResume:\n${resumeText}\n\nJob:\n${jobDescription}\n\nCover letter:`
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
            temperature: 0.7,
            maxOutputTokens: 4096
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

async function createWordDoc(content, title) {
    const cleanContent = cleanAIResponse(content)
        .replace(/\*\*/g, '') // Remove ** bold markers
        .replace(/\*/g, '') // Remove * markers
        .replace(/_{2,}/g, '') // Remove multiple underscores
        .replace(/^_+|_+$/gm, '') // Remove leading/trailing underscores
        .replace(/^#+\s*/gm, '') // Remove # headers
        .replace(/`{1,3}/g, '') // Remove code markers
        .trim();

    const lines = cleanContent.split('\n').filter(line => line.trim());
    const children = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Name (first line)
        if (i === 0) {
            children.push(new Paragraph({
                children: [new TextRun({
                    text: line,
                    bold: true,
                    size: 36,
                    color: "2c5aa0"
                })],
                spacing: { after: 200 }
            }));

            // Contact info (has @ or phone patterns)
        } else if (line.includes('@') || /\(\d{3}\)/.test(line)) {
            children.push(new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 20,
                    color: "555555"
                })],
                spacing: { after: 300 }
            }));

            // Section headers (ALL CAPS)
        } else if (line === line.toUpperCase() && line.length < 30) {
            children.push(new Paragraph({
                children: [new TextRun({
                    text: line,
                    bold: true,
                    size: 24,
                    color: "2c5aa0"
                })],
                spacing: { before: 200, after: 200 }
            }));

            // Company lines (Gemini formatted with COMPANY:)
        } else if (line.startsWith('COMPANY:')) {
            children.push(new Paragraph({
                children: [new TextRun({
                    text: line.replace('COMPANY: ', ''),
                    bold: true,
                    size: 24,
                    color: "000000"
                })],
                spacing: { before: 200, after: 100 }
            }));

            // Job titles (Gemini formatted with TITLE:)
        } else if (line.startsWith('TITLE:')) {
            children.push(new Paragraph({
                children: [new TextRun({
                    text: line.replace('TITLE: ', ''),
                    bold: true,
                    size: 20,
                    color: "333333"
                })],
                spacing: { after: 100 }
            }));

            // Company descriptions (Gemini formatted with DESC:)
        } else if (line.startsWith('DESC:')) {
            children.push(new Paragraph({
                children: [new TextRun({
                    text: line.replace('DESC: ', ''),
                    size: 20,
                    color: "555555",
                    italics: true
                })],
                spacing: { after: 200 }
            }));

            // Bullets (work experience)
        } else if (line.startsWith('•')) {
            children.push(new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 20,
                    color: "333333"
                })],
                indent: { left: 200 },
                spacing: { after: 100 }
            }));

            // Everything else (regular text)
        } else {
            children.push(new Paragraph({
                children: [new TextRun({
                    text: line,
                    size: 20,
                    color: "333333"
                })],
                spacing: { after: 100 }
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

async function customizeWithClaude(resumeText, jobDescription, apiKey, type) {
    const prompts = {
        resume: `Customize this resume for the job. Focus on relevant skills and keywords. IMPORTANT: Keep ALL work experience, achievements, and dates. Do not remove or summarize any job experiences - preserve all bullet points and accomplishments. Only optimize wording and emphasize relevant skills.

For companies that are not widely known (like startups or smaller companies), include a brief 1-2 line company description. Skip descriptions for well-known companies like Amazon, Google, Microsoft, Meta, etc.

Resume:\n${resumeText}\n\nJob:\n${jobDescription}\n\nCustomized resume:`,
        cover_letter: `Write a professional cover letter based on this resume and job description.\n\nResume:\n${resumeText}\n\nJob:\n${jobDescription}\n\nCover letter:`
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
    return createStyledPDF(content, title, '', '');
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

        const [customizedResume, coverLetter] = await Promise.all([
            customizeFunction(resumeText, jobDescription, apiKey, 'resume'),
            customizeFunction(resumeText, jobDescription, apiKey, 'cover_letter')
        ]);

        res.json({
            resume: customizedResume,
            coverLetter: coverLetter,
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