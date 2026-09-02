# ---- Stage 1: build the React frontend ----
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

# ---- Stage 2: runtime — backend plus the built frontend, no build tooling ----
FROM node:22-alpine

# Chromium for the Puppeteer job-page scraper. Puppeteer's own Chrome download is a
# glibc build that cannot run on Alpine (and adds 600+ MB), so skip it and use the
# distro package, which exists for both amd64 and arm64.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Backend production dependencies only
COPY backend/package*.json ./backend/
RUN npm ci --omit=dev --prefix backend && npm cache clean --force

# Backend source, then the built React app where Express serves it from
COPY backend/ ./backend/
COPY --from=frontend-build /app/build ./backend/public

LABEL org.opencontainers.image.source="https://github.com/monahand1023/resume-generator" \
      org.opencontainers.image.description="Job-tailored resume & cover-letter generator (React + Express, served by Node)" \
      org.opencontainers.image.licenses="MIT"

EXPOSE 3000

CMD ["node", "backend/server.js"]
