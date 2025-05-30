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
        resume: `Customize this resume for the job. Focus on relevant skills and keywords. Keep same format but optimize content.\n\nResume:\n${resumeText}\n\nJob:\n${jobDescription}\n\nCustomized resume:`,
        cover_letter: `Write a professional cover letter based on this resume and job description.\n\nResume:\n${resumeText}\n\nJob:\n${jobDescription}\n\nCover letter:`
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
        resume: `Customize this resume for the job. Focus on relevant skills and keywords. Maintain a professional tone and structure. Optimize content for clarity and impact, ensuring it aligns closely with the job requirements.\n\nResume:\n${resumeText}\n\nJob:\n${jobDescription}\n\nCustomized resume:`,
        cover_letter: `Write a professional, compelling, and concise cover letter based on this resume and job description. Highlight the most relevant skills and experiences. Tailor the letter specifically to the job, expressing genuine interest.\n\nResume:\n${resumeText}\n\nJob:\n${jobDescription}\n\nCover letter:`
    };

    // --- Model Selection ---
    // Using gemini-1.5-pro-latest for the highest capability.
    // For a faster and more cost-effective option, consider 'gemini-1.5-flash-latest'.
    const modelName = 'gemini-1.5-pro-latest';
    // const modelName = 'gemini-1.5-flash-latest'; // Alternative for speed/cost

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const requestBody = {
        contents: [{
            parts: [{
                text: prompts[type]
            }]
        }],
        generationConfig: {
            temperature: 0.7, // Adjust for creativity vs. determinism. Lower is more deterministic.
            maxOutputTokens: 4096 // Increased token limit, suitable for newer models. Adjust as needed.
                                  // gemini-1.5-pro can handle much larger contexts and outputs.
        },
        // Optional: Add safety settings for more control over content filtering
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
    };

    // Assuming Node.js v18+ for global fetch.
    // If using an older version, ensure you have 'node-fetch' installed and imported:
    // const fetch = require('node-fetch');
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
            const errorData = await response.json(); // Try to get detailed error from API
            errorDetails += `, Response: ${JSON.stringify(errorData)}`;
        } catch (e) {
            // If response.json() fails, try to get raw text
            const textError = await response.text();
            errorDetails += `, Response (raw): ${textError}`;
        }
        console.error('Gemini API Error:', errorDetails);
        // It might be useful to throw an error object that contains the status code
        const err = new Error(`Gemini API request failed. ${errorDetails}`);
        err.status = response.status; // Add status to the error object if needed
        throw err;
    }

    const data = await response.json();

    // Robustly check the response structure
    if (data.candidates && data.candidates.length > 0 &&
        data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0 &&
        typeof data.candidates[0].content.parts[0].text === 'string') { // Ensure text is a string
        return data.candidates[0].content.parts[0].text;
    } else if (data.promptFeedback && data.promptFeedback.blockReason) {
        // Handle cases where content is blocked by safety settings
        const blockReason = data.promptFeedback.blockReason;
        const safetyRatings = JSON.stringify(data.promptFeedback.safetyRatings || 'No specific ratings provided.');
        console.error(`Gemini content blocked. Reason: ${blockReason}, Ratings: ${safetyRatings}`);
        throw new Error(`Your request was blocked by Gemini's safety filters. Reason: ${blockReason}. Please revise your input or check safety settings.`);
    } else {
        // Handle other unexpected response structures
        console.warn("Gemini response structure unexpected, empty, or text part missing:", JSON.stringify(data));
        throw new Error('Gemini API returned an unexpected, empty, or improperly formatted response structure.');
    }
}

function createPDF(content, title) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            // Add title
            doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'center' });
            doc.moveDown();

            // Add content with proper formatting
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    // Check if line looks like a header (all caps or ends with colon)
                    if (line.trim().endsWith(':') || line.trim() === line.trim().toUpperCase()) {
                        doc.fontSize(12).font('Helvetica-Bold').text(line.trim());
                    } else {
                        doc.fontSize(10).font('Helvetica').text(line.trim());
                    }
                } else {
                    doc.moveDown(0.5);
                }
            }

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

async function createWordDoc(content, title) {
    const paragraphs = content.split('\n').map(line => {
        if (!line.trim()) {
            return new Paragraph({ text: '' });
        }

        // Check if line looks like a header
        if (line.trim().endsWith(':') || line.trim() === line.trim().toUpperCase()) {
            return new Paragraph({
                children: [new TextRun({ text: line.trim(), bold: true })],
                heading: HeadingLevel.HEADING_2
            });
        }

        return new Paragraph({
            children: [new TextRun({ text: line.trim() })]
        });
    });

    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({
                    children: [new TextRun({ text: title, bold: true, size: 24 })],
                    heading: HeadingLevel.TITLE
                }),
                ...paragraphs
            ]
        }]
    });

    return await Packer.toBuffer(doc);
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

        let customizeFunction;
        if (provider === 'openai') {
            customizeFunction = customizeWithOpenAI;
        } else if (provider === 'gemini') {
            customizeFunction = customizeWithGemini;
        } else {
            return res.status(400).json({ error: 'Invalid provider' });
        }

        const [customizedResume, coverLetter] = await Promise.all([
            customizeFunction(resumeText, jobDescription, apiKey, 'resume'),
            customizeFunction(resumeText, jobDescription, apiKey, 'cover_letter')
        ]);

        res.json({
            resume: customizedResume,
            coverLetter: coverLetter
        });

    } catch (error) {
        console.error('Error:', error);
        let statusCode = 500;
        let errorMessage = error.message;

        if (error.message?.includes('429')) {
            statusCode = 429;
            errorMessage = 'API quota exceeded';
        } else if (error.message?.includes('401')) {
            statusCode = 401;
            errorMessage = 'Invalid API key';
        }

        res.status(statusCode).json({ error: errorMessage });
    }
});

app.post('/api/format-document', async (req, res) => {
    try {
        const { content, format, filename } = req.body;

        if (!content || !format || !filename) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let buffer;
        let contentType;
        let fileExtension;

        if (format === 'pdf') {
            buffer = await createPDF(content, filename);
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