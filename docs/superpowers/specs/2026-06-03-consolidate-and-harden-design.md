# Consolidate two backends into one product, then harden

**Date:** 2026-06-03
**Status:** Approved — implementing

## Problem

The same product exists twice:

- **`resume-generator`** — React + Node/Express. The *complete* product: UI, async
  job queue + SSE, document rendering (PDF/DOCX), three BYO-key providers
  (OpenAI / Gemini / Claude).
- **`resume-generator-backend`** — Go/AWS-Lambda reimplementation. Bedrock Nova
  only, no UI, no rendering, no multi-provider, no async queue — but it has the
  *better* engineering: real SSRF protection, retry/backoff, structured logging.

Engineering investment diverged: the shipping Node product has a **live SSRF
hole** (`utils/scraper.js` calls `page.goto(url)` with no validation) while the
Go repo solved exactly that problem and was never back-ported.

## Decision

1. **Node/Express is the single product.** Port the Go backend's unique value
   into it, then **delete the Go repo**.
2. **Keep AWS Bedrock** as a 4th provider inside the Node app, using server-side
   AWS credentials (not a user-entered key).

## Design

### A. Provider registry
Replace `services/ai/{openai,gemini,claude}.js` + the hardcoded `providerMap`
and `validateApiKeyFormat` in `routes/resume.js` with a registry. Each provider
is a descriptor module:

```js
{ id, label, keyPattern, keyHint, promptFormat, usesServerCredentials,
  isAvailable(), customize({resumeText, jobDescription, apiKey, type, signal}) }
```

- `services/ai/index.js` — registry: `getProvider(id)`, `listProviders()`,
  `validateKey(id, key)`.
- `services/ai/http.js` — shared `postJSON(url, {headers, body, signal,
  timeoutMs})` with `AbortController` timeout + normalized errors; backs the
  fetch providers so OpenAI/Gemini stop being ~80% duplicated.
- `createPrompt` is unchanged.

### B. Bedrock provider
`services/ai/providers/bedrock.js` using `@aws-sdk/client-bedrock-runtime`.
Ports the Go Nova request shape and retry/backoff (`bedrock.go:100-137`).
`usesServerCredentials:true`; `isAvailable()` is true only when AWS creds +
region are configured. New `GET /api/providers` reports availability so the
frontend only shows Bedrock when the server supports it.

### C. SSRF hardening
`utils/ssrf.js` — JS port of `ValidateJobURL` (`scraper.go:41-69`): http/https
only, DNS-resolve host, reject private/reserved CIDRs. `scraper.js` validates
before `page.goto` and uses Puppeteer request interception to block
redirect/navigation to private IPs (equivalent of Go's `CheckRedirect`).
Known residual: DNS-rebinding TOCTOU — same risk level as the Go original.

### D. Config, logging, robustness
- `config.js` — env-driven defaults for model IDs, timeouts, rate-limit windows,
  file-size cap, job TTL, cleanup interval, JD max length, Bedrock region/model.
- `utils/logger.js` — dependency-free structured-JSON logger (mirrors Go slog);
  replaces `console.*`; **redacts API keys**.
- Gemini key moves from URL query to `x-goog-api-key` header.
- Per-AI-call timeouts via provider `signal`; real try/catch on fetch providers.
- `db.js` prepares statements once at init, not per call.
- Input-size guards on resume text / jobUrl before the AI call.

### E. Frontend made provider-driven
`src/config/providers.js` drives key inputs, buttons, progress bars, and error
cards via `.map()` instead of three hardcoded copies — shrinks `App.js` and makes
Bedrock appear automatically. Frontend calls `GET /api/providers`; hides the key
field for server-credential providers.

### F. Retire the Go repo
After parity: `rm -rf resume-generator-backend/` (its own git history is the
recovery path). Done last, after SSRF + Bedrock + retry are live in Node.

## Testing
New tests: SSRF validator, provider registry, Bedrock provider (mocked AWS SDK),
config defaults. Keep all 48 existing Node tests green. Add a couple of frontend
tests (currently zero).

## Out of scope (follow-ups)
TypeScript migration, Redis/distributed cache, webhook delivery, circuit breaker.
