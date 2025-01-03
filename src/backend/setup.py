from setuptools import setup, find_packages

# Package metadata and configuration for the Agent Builder Hub backend services
setup(
    name="agent-builder-hub-backend",
    version="0.1.0",
    description="Backend services for the Agent Builder Hub platform",
    author="Hakkoda",
    author_email="engineering@hakkoda.io",
    python_requires=">=3.11,<4.0",
    license="Proprietary",
    
    # Package discovery and structure
    package_dir={"": "src"},
    packages=find_packages(where="src"),
    include_package_data=True,
    zip_safe=False,
    
    # Package classifiers for PyPI
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3.11",
        "Operating System :: OS Independent",
        "Framework :: FastAPI",
        "Topic :: Software Development :: Libraries :: Application Frameworks",
    ],
    
    # Core dependencies with version specifications
    install_requires=[
        "fastapi>=0.104.0,<0.105.0",  # Core API framework
        "uvicorn>=0.24.0,<0.25.0",    # ASGI server
        "pydantic>=2.4.0,<3.0.0",     # Data validation
        "sqlalchemy>=2.0.0,<3.0.0",   # Database ORM
        "alembic>=1.12.0,<2.0.0",     # Database migrations
        "python-jose[cryptography]>=3.3.0,<4.0.0",  # JWT handling
        "passlib[bcrypt]>=1.7.4,<2.0.0",  # Password hashing
        "python-multipart>=0.0.6,<0.1.0",  # Form data handling
        "langchain>=0.1.0,<0.2.0",    # RAG implementation
        "openai>=1.3.0,<2.0.0",       # OpenAI integration
        "anthropic>=0.5.0,<0.6.0",    # Claude integration
        "boto3>=1.29.0,<2.0.0",       # AWS SDK
        "opensearch-py>=2.3.0,<3.0.0",  # OpenSearch client
        "redis>=5.0.0,<6.0.0",        # Redis client
        "prometheus-client>=0.17.0,<0.18.0",  # Metrics
        "sentry-sdk>=1.32.0,<2.0.0",  # Error tracking
    ],
    
    # Development dependencies
    extras_require={
        "dev": [
            "pytest>=7.4.0,<8.0.0",
            "pytest-cov>=4.1.0,<5.0.0",
            "pytest-asyncio>=0.21.0,<0.22.0",
            "black>=23.10.0,<24.0.0",
            "isort>=5.12.0,<6.0.0",
            "mypy>=1.6.0,<2.0.0",
            "flake8>=6.1.0,<7.0.0",
            "pre-commit>=3.5.0,<4.0.0",
        ],
        "docs": [
            "sphinx>=7.2.0,<8.0.0",
            "sphinx-rtd-theme>=1.3.0,<2.0.0",
        ],
    },
    
    # Entry points for CLI tools
    entry_points={
        "console_scripts": [
            "agent-hub=agent_builder_hub.cli:main",
        ],
    },
    
    # Project URLs
    project_urls={
        "Bug Tracker": "https://github.com/hakkoda/agent-builder-hub/issues",
        "Documentation": "https://agent-builder-hub.readthedocs.io/",
        "Source Code": "https://github.com/hakkoda/agent-builder-hub",
    },
)