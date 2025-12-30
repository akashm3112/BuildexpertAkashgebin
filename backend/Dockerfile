# ============================================================================
# BuildXpert Backend - Production Dockerfile
# ============================================================================
# Multi-stage build for optimized production image
# ============================================================================

# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including PM2 for production clustering)
RUN npm install --production --no-audit --no-fund && npm cache clean --force

# Stage 2: Production stage
FROM node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security (non-root)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p logs uploads && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (default 5000, but should use PORT env var)
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5000) + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]

