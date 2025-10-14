# Zone News Bot - Analytics Service
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Set environment variables
ENV NODE_ENV=production \
    ANALYTICS_SERVICE_PORT=4006

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4006/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Expose port
EXPOSE 4006

# Run as non-root user
USER node

# Start the service
CMD ["node", "src/index.js"]
