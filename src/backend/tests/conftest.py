"""
Enterprise-grade pytest configuration for Agent Builder Hub backend test suite.
Provides comprehensive test fixtures, environment setup, and resource management.
Version: 1.0.0
"""

import os
import pytest
import logging
from typing import Dict, Generator, Any
from datetime import datetime
from uuid import uuid4

# Third-party imports with versions
import sqlalchemy  # ^2.0.0
from moto import mock_aws  # ^4.2.0
from faker import Faker  # ^19.3.0
from tenacity import retry, stop_after_attempt  # ^8.2.0
from prometheus_client import CollectorRegistry  # ^0.17.0

# Internal imports
from src.config.settings import get_settings, get_aws_config
from src.config.database import DatabaseManager
from src.core.auth.cognito import CognitoAuth

# Global test constants
TEST_DB_URL = os.getenv('TEST_DB_URL', 'postgresql://test:test@localhost:5432/test_db')
TEST_USER_POOL_ID = os.getenv('TEST_USER_POOL_ID', 'us-west-2_test')
TEST_CLIENT_ID = os.getenv('TEST_CLIENT_ID', 'test_client_id')
TEST_AWS_REGION = os.getenv('TEST_AWS_REGION', 'us-west-2')
TEST_LOG_LEVEL = os.getenv('TEST_LOG_LEVEL', 'INFO')

def pytest_configure(config):
    """Configure test environment with security controls and monitoring."""
    # Set secure test environment variables
    os.environ['ENVIRONMENT'] = 'test'
    os.environ['AWS_DEFAULT_REGION'] = TEST_AWS_REGION
    os.environ['COGNITO_USER_POOL_ID'] = TEST_USER_POOL_ID
    os.environ['COGNITO_CLIENT_ID'] = TEST_CLIENT_ID
    
    # Configure test logging
    logging.basicConfig(
        level=getattr(logging, TEST_LOG_LEVEL),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Initialize test metrics registry
    registry = CollectorRegistry()
    setattr(config, 'metrics_registry', registry)
    
    # Configure test database
    db_config = {
        'sqlalchemy.url': TEST_DB_URL,
        'sqlalchemy.pool_size': 5,
        'sqlalchemy.max_overflow': 10,
        'sqlalchemy.pool_timeout': 30
    }
    setattr(config, 'db_config', db_config)

@pytest.fixture(scope='session')
def aws_credentials():
    """Provide mock AWS credentials for testing."""
    os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
    os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
    os.environ['AWS_SECURITY_TOKEN'] = 'testing'
    os.environ['AWS_SESSION_TOKEN'] = 'testing'

@pytest.fixture(scope='session')
def aws_mock(aws_credentials):
    """Provide comprehensive AWS service mocking."""
    with mock_aws():
        yield

@pytest.fixture(scope='session')
def test_db():
    """Configure and provide test database connection."""
    settings = get_settings()
    db_manager = DatabaseManager(settings.database_config)
    
    # Create test database with proper isolation
    engine = db_manager.get_postgres_engine()
    
    # Apply migrations
    from alembic.config import Config
    from alembic import command
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    
    yield engine
    
    # Cleanup test database
    engine.dispose()

@pytest.fixture
def db_session(test_db):
    """Provide database session with transaction isolation."""
    connection = test_db.connect()
    transaction = connection.begin()
    Session = sqlalchemy.orm.sessionmaker(bind=connection)
    session = Session()
    
    yield session
    
    # Rollback transaction and cleanup
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def mock_cognito(aws_mock):
    """Provide mock Cognito authentication with role simulation."""
    auth = CognitoAuth()
    
    # Configure mock user pool
    auth._client.create_user_pool(
        PoolName='test_pool',
        UserPoolId=TEST_USER_POOL_ID
    )
    
    # Create test app client
    auth._client.create_user_pool_client(
        UserPoolId=TEST_USER_POOL_ID,
        ClientName='test_client',
        ClientId=TEST_CLIENT_ID
    )
    
    yield auth

@pytest.fixture
def test_user(mock_cognito):
    """Provide test user with authentication."""
    fake = Faker()
    user_data = {
        'username': fake.email(),
        'password': 'Test123!@#',
        'user_attributes': [
            {'Name': 'email', 'Value': fake.email()},
            {'Name': 'custom:role', 'Value': 'admin'}
        ]
    }
    
    # Create test user
    mock_cognito._client.admin_create_user(
        UserPoolId=TEST_USER_POOL_ID,
        Username=user_data['username'],
        TemporaryPassword=user_data['password'],
        UserAttributes=user_data['user_attributes']
    )
    
    yield user_data

@pytest.fixture
def auth_headers(mock_cognito, test_user):
    """Provide authenticated request headers."""
    # Generate test tokens
    tokens = mock_cognito.authenticate(
        test_user['username'],
        test_user['password']
    )
    
    return {
        'Authorization': f"Bearer {tokens['access_token']}",
        'X-Request-ID': str(uuid4())
    }

@pytest.fixture
def test_client(aws_mock):
    """Provide FastAPI test client with security headers."""
    from fastapi.testclient import TestClient
    from main import app
    
    client = TestClient(app)
    
    # Add security headers
    client.headers.update({
        'X-Request-ID': str(uuid4()),
        'User-Agent': 'TestClient/1.0'
    })
    
    return client

@pytest.fixture
def mock_aws_services(aws_mock):
    """Provide comprehensive mock AWS services."""
    services = {
        's3': mock_aws.s3(),
        'dynamodb': mock_aws.dynamodb2(),
        'opensearch': mock_aws.opensearch(),
        'bedrock': mock_aws.bedrock()
    }
    
    # Initialize mock resources
    services['s3'].create_bucket(Bucket='test-bucket')
    services['dynamodb'].create_table(
        TableName='test-table',
        KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
        AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
        BillingMode='PAY_PER_REQUEST'
    )
    
    yield services

@pytest.fixture
def test_metrics(request):
    """Provide test metrics collection."""
    registry = getattr(request.config, 'metrics_registry')
    
    # Initialize test metrics
    metrics = {
        'api_requests': registry.counter('api_requests_total', 'Total API requests'),
        'response_time': registry.histogram('response_time_seconds', 'Response time in seconds')
    }
    
    yield metrics

@pytest.fixture(autouse=True)
def cleanup_test_data(db_session):
    """Automatically cleanup test data after each test."""
    yield
    
    try:
        # Rollback any pending transactions
        db_session.rollback()
        # Delete test data
        for table in reversed(sqlalchemy.MetaData().sorted_tables):
            db_session.execute(table.delete())
        db_session.commit()
    except Exception as e:
        logging.error(f"Error cleaning up test data: {e}")
        db_session.rollback()