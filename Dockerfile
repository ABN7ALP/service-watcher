# Use Node.js LTS version
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    curl \
    bash \
    python3 \
    make \
    g++ \
    mongodb-tools

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Create necessary directories
RUN mkdir -p \
    server/uploads/profiles \
    server/uploads/voices \
    server/uploads/receipts \
    server/uploads/gifts \
    logs

# Set permissions
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose port (Railway uses PORT environment variable)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "start"]
