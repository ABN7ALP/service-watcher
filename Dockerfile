# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p server/uploads/profiles \
    server/uploads/voices \
    server/uploads/receipts \
    server/uploads/gifts \
    logs

# Set permissions
RUN chown -R node:node /app

# Production stage
FROM node:18-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S node -u 1001

# Copy from builder
COPY --from=builder --chown=node:node /app .

# Switch to non-root user
USER node

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/health', (r) => {if(r.statusCode!==200)throw new Error(r.statusCode)})"

# Start application
CMD ["node", "server/server.js"]
