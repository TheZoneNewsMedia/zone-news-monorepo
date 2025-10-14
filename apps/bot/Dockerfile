# Zone News Bot - Telegram Bot Service
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy application code
COPY . .

# Create logs directory and set permissions
RUN mkdir -p logs && chown -R node:node logs

# Set environment variables
ENV NODE_ENV=production \
    WEBHOOK_PORT=3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Expose port
EXPOSE 3002

# Run as non-root user
USER node

# Start the bot
CMD ["node", "index.js"]
