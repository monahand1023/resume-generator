# Base image with Node
FROM node:20

# Set working directory
WORKDIR /app

# Copy package and install dependencies
COPY package*.json ./
RUN npm install

# Copy rest of the app
COPY . .

# Build frontend (React app)
RUN npm run build

# Move the built frontend into the Express public folder
RUN rm -rf public && mv build public

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]