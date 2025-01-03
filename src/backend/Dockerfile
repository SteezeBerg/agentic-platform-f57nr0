# Stage 1: Builder
FROM python:3.11-slim AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set appropriate permissions
RUN chmod -R 755 /app

# Clean up build artifacts and cache
RUN apt-get purge -y --auto-remove build-essential \
    && rm -rf /root/.cache/pip/*

# Stage 2: Runtime
FROM python:3.11-slim

# Set labels
LABEL maintainer="Hakkoda DevOps Team <devops@hakkoda.io>" \
      version="1.0.0" \
      description="Agent Builder Hub Backend Service"

# Set working directory
WORKDIR /app

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -u 1000 -s /sbin/nologin appuser

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy built dependencies and application from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /app /app

# Set secure permissions
RUN chown -R appuser:appuser /app \
    && chmod -R 755 /app \
    && chmod -R 644 $(find /app -type f) \
    && chmod -R 755 $(find /app -type d)

# Set environment variables
ENV PYTHONPATH=/app/src \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    WORKERS=4

# Expose port
EXPOSE 8000

# Switch to non-root user
USER appuser

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl --fail http://localhost:8000/health || exit 1

# Set security options
RUN echo "no-new-privileges:true" > /etc/security/limits.d/appuser.conf

# Create necessary directories with appropriate permissions
RUN mkdir -p /app/data && \
    chown -R appuser:appuser /app/data

# Set the entrypoint
ENTRYPOINT ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]