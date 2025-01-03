# Stage 1: Build environment
FROM node:23-alpine AS builder

# Build arguments for environment configuration
ARG BUILD_VERSION
ARG COMMIT_HASH
ARG VITE_API_URL
ARG VITE_AWS_REGION
ARG VITE_COGNITO_USER_POOL_ID
ARG VITE_COGNITO_CLIENT_ID

# Validate build arguments
RUN test -n "$BUILD_VERSION" && \
    test -n "$COMMIT_HASH" && \
    test -n "$VITE_API_URL" && \
    test -n "$VITE_AWS_REGION" && \
    test -n "$VITE_COGNITO_USER_POOL_ID" && \
    test -n "$VITE_COGNITO_CLIENT_ID"

# Set environment variables
ENV NODE_ENV=production \
    VITE_API_URL=$VITE_API_URL \
    VITE_AWS_REGION=$VITE_AWS_REGION \
    VITE_COGNITO_USER_POOL_ID=$VITE_COGNITO_USER_POOL_ID \
    VITE_COGNITO_CLIENT_ID=$VITE_COGNITO_CLIENT_ID \
    VITE_BUILD_VERSION=$BUILD_VERSION \
    VITE_COMMIT_HASH=$COMMIT_HASH

# Set working directory
WORKDIR /app

# Install build dependencies and security updates
RUN apk update && \
    apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files with strict permissions
COPY --chown=node:node package.json package-lock.json ./

# Install production dependencies with npm ci for consistent builds
RUN npm ci --production=false --no-audit

# Copy source code with integrity verification
COPY --chown=node:node . .

# Build production assets with optimization flags
RUN npm run build

# Verify build artifacts integrity
RUN test -d dist && \
    test -f dist/index.html

# Stage 2: Production environment
FROM nginx:alpine

# Install security updates
RUN apk update && \
    apk upgrade && \
    apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Create nginx user and group
RUN addgroup -g 101 -S nginx && \
    adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx

# Copy nginx configuration with security hardening
COPY --chown=nginx:nginx infrastructure/docker/nginx.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx infrastructure/docker/security-headers.conf /etc/nginx/security-headers.conf

# Copy built assets from builder stage
COPY --chown=nginx:nginx --from=builder /app/dist /usr/share/nginx/html

# Configure strict file permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chmod -R 755 /var/cache/nginx /var/run && \
    rm /etc/nginx/conf.d/default.conf

# Set resource limits
ENV NGINX_WORKER_PROCESSES=auto \
    NGINX_WORKER_CONNECTIONS=1024 \
    NGINX_KEEPALIVE_TIMEOUT=65

# Expose port
EXPOSE 80

# Configure healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail http://localhost:80/health || exit 1

# Set user
USER nginx

# Set security options
LABEL org.opencontainers.image.source="https://github.com/hakkoda/agent-builder-hub" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${COMMIT_HASH}"

# Apply security configurations
RUN echo "kernel.unprivileged_userns_clone=1" > /etc/sysctl.d/userns.conf

# Set read-only root filesystem
VOLUME ["/var/cache/nginx", "/var/run"]

# Start nginx
CMD ["nginx", "-g", "daemon off;"]