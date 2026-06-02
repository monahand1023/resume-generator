FROM node:22-alpine

WORKDIR /app

# Copy and install frontend dependencies, then build
COPY package*.json ./
RUN npm ci

COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

# Copy and install backend dependencies (production only)
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --production

# Copy backend source
WORKDIR /app
COPY backend/ ./backend/

# Move built React app into backend's public folder so Express serves it
RUN rm -rf backend/public && mv build backend/public

LABEL org.opencontainers.image.source="https://github.com/monahand1023/resume-generator" \
      org.opencontainers.image.description="Job-tailored resume & cover-letter generator (React + Express, served by Node)" \
      org.opencontainers.image.licenses="MIT"

EXPOSE 3000

CMD ["node", "backend/server.js"]
