"""
Core settings module for Agent Builder Hub backend service.
Manages all configuration settings with validation, security controls, and environment-specific configurations.
Version: 1.0.0
"""

import os
from typing import Dict, Optional, Any
from functools import lru_cache
import logging
from datetime import datetime, timedelta

# Third-party imports with versions
from dotenv import load_dotenv  # python-dotenv ^1.0.0
from pydantic import BaseModel, Field, validator  # pydantic ^2.0.0
from cryptography.fernet import Fernet  # cryptography ^41.0.0
from cachetools import TTLCache, cached  # cachetools ^5.3.0

# Global constants
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(BASE_DIR, '.env')
CONFIG_VERSION = '1.0.0'
CACHE_TTL = 300  # 5 minutes cache TTL

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AWSConfig(BaseModel):
    """AWS service configuration with validation"""
    region: str = Field(..., min_length=1)
    access_key_id: Optional[str] = None
    secret_access_key: Optional[str] = None
    s3_bucket: str
    dynamodb_table: str
    cognito_user_pool_id: str
    cognito_client_id: str

class DatabaseConfig(BaseModel):
    """Database configuration with connection pooling"""
    engine: str
    host: str
    port: int
    database: str
    username: str
    password: Optional[str] = None
    pool_size: int = 5
    max_overflow: int = 10
    pool_timeout: int = 30

class AuthConfig(BaseModel):
    """Authentication and authorization configuration"""
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    password_min_length: int = 12
    require_mfa: bool = True

class AIConfig(BaseModel):
    """AI service configuration"""
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    bedrock_enabled: bool = False
    default_model: str = "gpt-4"
    max_tokens: int = 2000
    temperature: float = 0.7
    rag_chunk_size: int = 1000
    rag_chunk_overlap: int = 200

class SecurityConfig(BaseModel):
    """Security controls configuration"""
    encryption_key: str
    allowed_origins: list = ["*"]
    ssl_verify: bool = True
    rate_limit_requests: int = 100
    rate_limit_period: int = 60
    session_timeout: int = 3600

class Settings(BaseModel):
    """Main settings class with comprehensive validation"""
    environment: str = Field(..., regex="^(development|staging|production)$")
    debug: bool = False
    api_version: str = "v1"
    project_name: str = "Agent Builder Hub"
    config_version: str = CONFIG_VERSION
    
    aws_config: AWSConfig
    database_config: DatabaseConfig
    auth_config: AuthConfig
    ai_config: AIConfig
    security_config: SecurityConfig

    @validator('environment')
    def validate_environment(cls, v):
        """Validate environment setting"""
        valid_environments = {'development', 'staging', 'production'}
        if v not in valid_environments:
            raise ValueError(f'Environment must be one of {valid_environments}')
        return v

    class Config:
        """Pydantic config"""
        validate_assignment = True
        extra = "forbid"

def load_env_file() -> None:
    """Load and validate environment variables from .env file"""
    try:
        if not os.path.exists(ENV_FILE):
            raise FileNotFoundError(f".env file not found at {ENV_FILE}")
        
        # Check file permissions (only owner should have read access)
        if os.name != 'nt':  # Skip on Windows
            file_mode = os.stat(ENV_FILE).st_mode
            if file_mode & 0o077:
                logger.warning(".env file permissions are too open. Recommended: 600")
        
        load_dotenv(ENV_FILE)
        logger.info("Successfully loaded environment variables")
        
    except Exception as e:
        logger.error(f"Error loading environment variables: {str(e)}")
        raise

@lru_cache()
def get_settings() -> Settings:
    """Returns cached singleton instance of Settings"""
    try:
        load_env_file()
        
        # Initialize encryption for sensitive values
        fernet = Fernet(os.getenv('ENCRYPTION_KEY', '').encode())
        
        # Build AWS configuration
        aws_config = AWSConfig(
            region=os.getenv('AWS_REGION'),
            access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            s3_bucket=os.getenv('AWS_S3_BUCKET'),
            dynamodb_table=os.getenv('AWS_DYNAMODB_TABLE'),
            cognito_user_pool_id=os.getenv('COGNITO_USER_POOL_ID'),
            cognito_client_id=os.getenv('COGNITO_CLIENT_ID')
        )
        
        # Build database configuration
        database_config = DatabaseConfig(
            engine=os.getenv('DB_ENGINE', 'postgresql'),
            host=os.getenv('DB_HOST'),
            port=int(os.getenv('DB_PORT', 5432)),
            database=os.getenv('DB_NAME'),
            username=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD'),
            pool_size=int(os.getenv('DB_POOL_SIZE', 5))
        )
        
        # Build auth configuration
        auth_config = AuthConfig(
            jwt_secret_key=os.getenv('JWT_SECRET_KEY'),
            jwt_algorithm=os.getenv('JWT_ALGORITHM', 'HS256'),
            access_token_expire_minutes=int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', 30))
        )
        
        # Build AI configuration
        ai_config = AIConfig(
            openai_api_key=os.getenv('OPENAI_API_KEY'),
            anthropic_api_key=os.getenv('ANTHROPIC_API_KEY'),
            bedrock_enabled=os.getenv('BEDROCK_ENABLED', 'false').lower() == 'true',
            default_model=os.getenv('DEFAULT_AI_MODEL', 'gpt-4')
        )
        
        # Build security configuration
        security_config = SecurityConfig(
            encryption_key=os.getenv('ENCRYPTION_KEY'),
            allowed_origins=os.getenv('ALLOWED_ORIGINS', '*').split(','),
            ssl_verify=os.getenv('SSL_VERIFY', 'true').lower() == 'true'
        )
        
        # Create and validate settings instance
        settings = Settings(
            environment=os.getenv('ENVIRONMENT', 'development'),
            debug=os.getenv('DEBUG', 'false').lower() == 'true',
            aws_config=aws_config,
            database_config=database_config,
            auth_config=auth_config,
            ai_config=ai_config,
            security_config=security_config
        )
        
        logger.info(f"Settings loaded successfully for environment: {settings.environment}")
        return settings
        
    except Exception as e:
        logger.error(f"Error initializing settings: {str(e)}")
        raise

# Export settings instance
settings = get_settings()

__all__ = ['settings', 'get_settings', 'Settings']