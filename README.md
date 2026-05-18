# Resume Customizer

AI-powered resume tailoring and cover letter generation. Upload your resume, paste a job URL, pick an AI provider — get a keyword-optimized resume and matching cover letter back in PDF, DOCX, or plain text.

Runs locally via Docker. No data is stored or shared. You bring your own API key.

![Main Screenshot](images/main.png)
![Download Screenshot](images/download.png)

## Tech Stack

- **Frontend**: React 18, Tailwind CSS
- **Backend**: Node.js, Express.js, Puppeteer (job scraping)
- **AI Providers**: OpenAI GPT-4, Google Gemini, Anthropic Claude
- **Document generation**: PDFKit (PDF), DOCX library (Word)
- **Serverless companion**: [resume-generator-backend](https://github.com/monahand1023/resume-generator-backend) — AWS Lambda + Amazon Bedrock Nova (Go)

## Quick Start

```bash
git clone https://github.com/monahand1023/resume-generator
cd resume-generator

# Install and build frontend
npm install && npm run build
cp -r build backend/public

# Install backend
cd backend && npm install
cp ../.env.example .env   # fill in your API keys

npm start   # http://localhost:3000
```

Or with Docker:

```bash
docker-compose up --build
```

## Environment Variables

Copy `.env.example` to `backend/.env`. Required variables:

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default: 3000) |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium path (Docker/CI only) |

At least one AI provider key is required at runtime (entered in the UI, not stored server-side):

- OpenAI key (`sk-...`) for GPT-4
- Google Gemini key (`AI...`)
- Anthropic Claude key (`sk-ant-...`)

Optional: `SMTP_*` vars for email delivery; `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS` + `GOOGLE_SPREADSHEET_ID` for Sheets logging.

## Features

- Upload PDF or DOCX resume; paste any job posting URL
- AI scrapes the JD and rewrites your resume with targeted keywords
- Generates a matching cover letter
- Shows a diff-style summary of what changed and why
- Exports to TXT (ATS paste), PDF, and DOCX
- Run all three providers in parallel to compare outputs

## API

**`POST /api/customize-resume`** — multipart/form-data

| Field | Type | Description |
|---|---|---|
| `resume` | file | PDF or DOCX, max 10 MB |
| `jobUrl` | string | Job posting URL to scrape |
| `apiKey` | string | Provider API key |
| `provider` | string | `openai`, `gemini`, or `claude` |

**`POST /api/format-document`** — JSON: converts AI output text to a PDF or DOCX binary download.

## Security

- API keys entered in the UI are stored in browser `localStorage` only — never sent to or persisted by the server
- Resume content and job descriptions are processed in memory; nothing is written to disk
- CORS, CSP, and standard security headers configured

## License

MIT
