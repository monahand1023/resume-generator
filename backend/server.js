const express = require('express');
const multer = require('multer');
const puppeteer = require('puppeteer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const cors = require('cors');
const path = require('path');

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

app.post('/api/customize-resume', upload.single('resume'), async (req, res) => {
    try {
        const { jobUrl, apiKey } = req.body;
        const resume = req.file?.buffer;

        if (!jobUrl || !apiKey || !resume) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const jobDescription = await scrapeJobDescription(jobUrl);
        const resumeText = await parseResumeFile(resume);

        const [customizedResume, coverLetter] = await Promise.all([
            customizeWithOpenAI(resumeText, jobDescription, apiKey, 'resume'),
            customizeWithOpenAI(resumeText, jobDescription, apiKey, 'cover_letter')
        ]);

        res.json({
            resume: customizedResume,
            coverLetter: coverLetter
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
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