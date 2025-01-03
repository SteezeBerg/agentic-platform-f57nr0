# ---- Build Stage ----
FROM node:18-alpine AS builder

# Security: Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files with explicit patterns
COPY --chown=appuser:appgroup package*.json ./
COPY --chown=appuser:appgroup tsconfig.json ./
COPY --chown=appuser:appgroup vite.config.ts ./

# Install dependencies with npm ci for reproducible builds
RUN npm ci --no-audit --no-fund

# Copy source code with specific ownership
COPY --chown=appuser:appgroup src/ ./src/
COPY --chown=appuser:appgroup public/ ./public/

# Set production environment
ENV NODE_ENV=production
ENV VITE_API_URL=${API_URL}
ENV VITE_AWS_REGION=${AWS_REGION}

# Build application
RUN npm run build

# Clean up
RUN npm cache clean --force

# ---- Production Stage ----
FROM nginx:1.25-alpine

# Security: Create non-root nginx user
RUN adduser -S nginxuser -G nginx

# Install required packages
RUN apk add --no-cache curl tzdata

# Set timezone
ENV TZ=UTC

# Copy custom nginx configuration
COPY infrastructure/docker/nginx.conf /etc/nginx/nginx.conf
COPY infrastructure/docker/security-headers.conf /etc/nginx/security-headers.conf

# Create required directories with proper permissions
RUN mkdir -p /var/cache/nginx /var/log/nginx && \
    chown -R nginxuser:nginx /var/cache/nginx /var/log/nginx && \
    chmod -R 755 /var/cache/nginx /var/log/nginx

# Copy built assets from builder stage
COPY --from=builder --chown=nginxuser:nginx /app/dist /usr/share/nginx/html

# Configure nginx security settings
RUN rm /etc/nginx/conf.d/default.conf && \
    chown -R nginxuser:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Set resource limits
RUN ulimit -n 32768

# Configure security headers
RUN echo "add_header X-Frame-Options DENY;" >> /etc/nginx/security-headers.conf && \
    echo "add_header X-Content-Type-Options nosniff;" >> /etc/nginx/security-headers.conf && \
    echo "add_header X-XSS-Protection \"1; mode=block\";" >> /etc/nginx/security-headers.conf && \
    echo "add_header Content-Security-Policy \"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.amazonaws.com;\";" >> /etc/nginx/security-headers.conf

# Set up volumes for logs and cache
VOLUME ["/var/log/nginx", "/var/cache/nginx"]

# Expose port
EXPOSE 80

# Switch to non-root user
USER nginxuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl --fail http://localhost/health || exit 1

# Set resource limits
ENV NGINX_WORKER_PROCESSES="auto" \
    NGINX_WORKER_CONNECTIONS="1024" \
    NGINX_WORKER_RLIMIT_NOFILE="32768"

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Build-time metadata
LABEL maintainer="Hakkoda Engineering Team" \
      version="1.0.0" \
      description="Agent Builder Hub Web Application" \
      org.opencontainers.image.source="https://github.com/hakkoda/agent-builder-hub"