# Build React frontend
FROM node:20-alpine as frontend
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

# Setup backend and serve
FROM node:20-alpine
WORKDIR /app

# Install Chrome for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Backend setup
COPY backend/package*.json ./
RUN npm ci

# Copy files
COPY backend/server.js ./
COPY --from=frontend /app/build ./public

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

EXPOSE 3000
CMD ["node", "server.js"]