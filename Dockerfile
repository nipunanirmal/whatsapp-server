# Dockerfile for QuickSend WhatsApp Server (whatsapp-web.js + Puppeteer)

# Use Debian-based Node image so we can install Chromium
FROM node:18-bullseye

# Create app directory
WORKDIR /usr/src/app

# Install Chromium (used by whatsapp-web.js via Puppeteer)
RUN apt-get update \ 
    && apt-get install -y --no-install-recommends \
        chromium \
        ca-certificates \
        fonts-liberation \
        wget \
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy the rest of the application source
COPY . .

# Environment variables
# WA_SESSION_PATH: where WhatsApp sessions are stored (will be mapped to a volume in Coolify)
# PUPPETEER_EXECUTABLE_PATH: tell whatsapp-web.js which Chromium to use
ENV NODE_ENV=production \
    WA_SESSION_PATH=/usr/src/app/session \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Ensure session directory exists and can be persisted as a volume
RUN mkdir -p /usr/src/app/session
VOLUME ["/usr/src/app/session"]

# The server listens on port 3000 (see server.js)
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
