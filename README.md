# Resume Customizer

AI-powered resume tailoring and cover letter generation. Upload your resume, paste a job URL, pick an AI provider — get a keyword-optimized resume and matching cover letter back in PDF, DOCX, or plain text.

Runs locally via Docker. No data is stored or shared. You bring your own API key.

![Main Screenshot](images/main.png)
![Download Screenshot](images/download.png)

## Tech Stack

- **Frontend**: React 18, Tailwind CSS
- **Backend**: Node.js, Express.js, Puppeteer (job scraping)
- **AI Providers**: OpenAI GPT-4, Google Gemini, Anthropic Claude, Amazon Bedrock (Nova)
- **Document generation**: PDFKit (PDF), DOCX library (Word)

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

Or run the prebuilt image from GitHub Container Registry:

```bash
docker run -p 3000:3000 --env-file backend/.env ghcr.io/monahand1023/resume-generator:latest
```

## Environment Variables

Copy `.env.example` to `backend/.env`. Required variables:

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default: 3000) |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium path (Docker/CI only) |

At least one AI provider is required. The three cloud providers use a key
entered in the UI (stored in browser `localStorage` only, never server-side):

- OpenAI key (`sk-...`) for GPT-4
- Google Gemini key (`AIza...`)
- Anthropic Claude key (`sk-ant-...`)

**Amazon Bedrock (Nova)** is also available as a provider, but it authenticates
with *server-side* AWS credentials rather than a user key. It appears in the UI
only when the server is configured for AWS. Enable it with standard AWS
credentials (`AWS_PROFILE`, static keys, or an ambient IAM role) or force it on
with `BEDROCK_ENABLED=true`. Tunables: `BEDROCK_MODEL_ID` (default
`us.amazon.nova-lite-v1:0`), `AWS_REGION`/`BEDROCK_REGION` (default `us-west-2`).

All other tunables (per-provider models, timeouts, rate limits, file-size cap,
job TTL, `JD_MAX_LENGTH`) are env-driven — see `backend/config.js` for the full
list and defaults.

Optional: `SMTP_*` vars for email delivery; `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS` + `GOOGLE_SPREADSHEET_ID` for Sheets logging.

`GET /api/providers` reports which providers this server supports and which need
a user key, so the frontend renders only the available ones.

## Features

- Upload PDF or DOCX resume; paste any job posting URL
- AI scrapes the JD and rewrites your resume with targeted keywords
- Generates a matching cover letter
- Shows a diff-style summary of what changed and why
- Exports to TXT (ATS paste), PDF, and DOCX
- Run multiple providers in parallel to compare outputs

## API

**`POST /api/customize-resume`** — multipart/form-data

| Field | Type | Description |
|---|---|---|
| `resume` | file | PDF or DOCX, max 10 MB |
| `jobUrl` | string | Job posting URL to scrape (validated for SSRF — private/reserved IPs rejected) |
| `apiKey` | string | Provider API key (omit for server-credential providers like `bedrock`) |
| `provider` | string | `openai`, `gemini`, `claude`, or `bedrock` |

**`POST /api/format-document`** — JSON: converts AI output text to a PDF or DOCX binary download.

## Security

- API keys entered in the UI are stored in browser `localStorage` only — never sent to or persisted by the server (and redacted from server logs)
- Resume content and job descriptions are processed in memory; nothing is written to disk
- **SSRF protection**: job URLs are validated before scraping — only http/https, and any hostname resolving to a private/reserved IP (RFC 1918, loopback, link-local, cloud metadata at 169.254.169.254) is rejected, including across redirects
- CORS, CSP, and standard security headers configured

## License

MIT
