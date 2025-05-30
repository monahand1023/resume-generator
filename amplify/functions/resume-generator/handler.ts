import type { APIGatewayProxyHandler } from 'aws-lambda';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

interface FormData {
    jobUrl: string;
    apiKey: string;
    resume: Buffer;
}

export const handler: APIGatewayProxyHandler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { jobUrl, apiKey, resume } = parseFormData(event.body!, event.headers['content-type']!);

        if (!jobUrl || !apiKey || !resume) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing required fields' })
            };
        }

        const jobDescription = await scrapeJobDescription(jobUrl);
        const resumeText = await parseResumeFile(resume);

        const [customizedResume, coverLetter] = await Promise.all([
            customizeWithOpenAI(resumeText, jobDescription, apiKey, 'resume'),
            customizeWithOpenAI(resumeText, jobDescription, apiKey, 'cover_letter')
        ]);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                resume: customizedResume,
                coverLetter: coverLetter
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: (error as Error).message })
        };
    }
};

async function scrapeJobDescription(url: string): Promise<string> {
    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
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

async function parseResumeFile(fileBuffer: Buffer): Promise<string> {
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

async function customizeWithOpenAI(resumeText: string, jobDescription: string, apiKey: string, type: 'resume' | 'cover_letter'): Promise<string> {
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

function parseFormData(body: string, contentType: string): FormData {
    const boundary = contentType.split('boundary=')[1];
    const parts = body.split(`--${boundary}`);

    const result: any = {};

    parts.forEach(part => {
        if (part.includes('Content-Disposition')) {
            const nameMatch = part.match(/name="([^"]+)"/);
            if (nameMatch) {
                const name = nameMatch[1];
                const content = part.split('\r\n\r\n')[1]?.split('\r\n--')[0];

                if (name === 'resume') {
                    result.resume = Buffer.from(content, 'base64');
                } else {
                    result[name] = content?.trim();
                }
            }
        }
    });

    return result;
}