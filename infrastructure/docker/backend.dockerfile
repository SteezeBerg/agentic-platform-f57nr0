# Stage 1: Builder
FROM python:3.11-slim as builder

# Set build environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POETRY_VERSION=1.7.0 \
    POETRY_HOME=/opt/poetry \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1 \
    PYTHONPATH=/app/src

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | python3 - \
    && ln -s /opt/poetry/bin/poetry /usr/local/bin/poetry

# Set working directory
WORKDIR /app

# Copy dependency files
COPY src/backend/pyproject.toml src/backend/poetry.lock ./

# Install dependencies
RUN poetry install --no-dev --no-root

# Copy source code
COPY src/backend/src ./src
COPY src/backend/tests ./tests

# Generate requirements.txt for the final stage
RUN poetry export -f requirements.txt --output requirements.txt --without-hashes

# Stage 2: Final
FROM python:3.11-slim

# Set runtime environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src \
    APP_USER=appuser \
    APP_GROUP=appgroup \
    APP_HOME=/app

# Create non-root user and group
RUN groupadd -r ${APP_GROUP} && \
    useradd -r -g ${APP_GROUP} -d ${APP_HOME} -s /sbin/nologin -c "App user" ${APP_USER}

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR ${APP_HOME}

# Copy requirements and install dependencies
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY --from=builder /app/src ./src

# Set proper permissions
RUN chown -R ${APP_USER}:${APP_GROUP} ${APP_HOME} && \
    chmod -R 755 ${APP_HOME}

# Configure resource limits
RUN ulimit -n 4096

# Set security options
RUN echo "appuser soft nofile 1024" >> /etc/security/limits.conf && \
    echo "appuser hard nofile 4096" >> /etc/security/limits.conf

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port
EXPOSE 8000

# Switch to non-root user
USER ${APP_USER}

# Use tini as init system
ENTRYPOINT ["/usr/bin/tini", "--"]

# Set default command
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

# Labels
LABEL maintainer="Hakkoda <engineering@hakkoda.io>" \
      version="0.1.0" \
      description="Agent Builder Hub Backend Service" \
      org.opencontainers.image.source="https://github.com/hakkoda/agent-builder-hub" \
      org.opencontainers.image.vendor="Hakkoda" \
      org.opencontainers.image.title="Agent Builder Hub Backend" \
      org.opencontainers.image.description="Backend services for the Agent Builder Hub platform" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.created=${BUILD_DATE} \
      org.opencontainers.image.revision=${BUILD_REVISION}