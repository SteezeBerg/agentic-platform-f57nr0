"""
Database configuration module for Agent Builder Hub.
Manages secure database connections, pools, and settings for multiple database systems.
Version: 1.0.0
"""

import ssl
import logging
from typing import Dict, Optional, Any
from datetime import datetime, timedelta

# Third-party imports with versions
import boto3  # ^1.28.0
import sqlalchemy  # ^2.0.0
from redis import Redis  # ^5.0.0
from opensearchpy import OpenSearch  # ^2.3.0

# Internal imports
from .settings import get_settings
from .aws import get_client

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
DEFAULT_POOL_SIZE = 20
DEFAULT_POOL_TIMEOUT = 30
DEFAULT_MAX_OVERFLOW = 10
DEFAULT_POOL_RECYCLE = 3600
DEFAULT_RETRY_COUNT = 3
SSL_VERIFY_MODE = ssl.CERT_REQUIRED
CONNECTION_MONITOR_INTERVAL = 300

class DatabaseManager:
    """Enhanced database connection manager with security, monitoring, and error handling"""
    
    def __init__(self, config: Dict[str, Any]):
        """Initialize database manager with enhanced security and monitoring"""
        self._config = config
        self._engines = {}
        self._clients = {}
        self._connection_stats = {}
        self._ssl_contexts = {}
        
        # Initialize SSL contexts for each database type
        self._init_ssl_contexts()
        
        # Set up connection monitoring
        self._init_connection_monitoring()
        
        logger.info("Database manager initialized with security controls")

    def _init_ssl_contexts(self):
        """Initialize SSL contexts with strict security settings"""
        for db_type in ['postgres', 'redis', 'opensearch']:
            context = ssl.create_default_context()
            context.verify_mode = SSL_VERIFY_MODE
            context.check_hostname = True
            self._ssl_contexts[db_type] = context

    def _init_connection_monitoring(self):
        """Initialize connection monitoring and statistics tracking"""
        self._connection_stats = {
            'postgres': {'active': 0, 'idle': 0, 'errors': 0},
            'dynamodb': {'requests': 0, 'errors': 0},
            'redis': {'connected': False, 'errors': 0},
            'opensearch': {'nodes': 0, 'errors': 0}
        }

    def get_postgres_engine(self) -> sqlalchemy.engine.Engine:
        """Returns secure SQLAlchemy engine with monitoring"""
        if 'postgres' not in self._engines:
            try:
                db_config = self._config['database_config']
                
                # Configure connection URL with security
                url = sqlalchemy.URL.create(
                    "postgresql+psycopg2",
                    username=db_config.username,
                    password=db_config.password,
                    host=db_config.host,
                    port=db_config.port,
                    database=db_config.database
                )

                # Configure engine with security and monitoring
                engine = sqlalchemy.create_engine(
                    url,
                    pool_size=db_config.pool_size or DEFAULT_POOL_SIZE,
                    max_overflow=DEFAULT_MAX_OVERFLOW,
                    pool_timeout=DEFAULT_POOL_TIMEOUT,
                    pool_recycle=DEFAULT_POOL_RECYCLE,
                    connect_args={
                        "sslmode": "verify-full",
                        "ssl_context": self._ssl_contexts['postgres']
                    }
                )

                self._engines['postgres'] = engine
                logger.info("PostgreSQL engine created with secure configuration")

            except Exception as e:
                logger.error(f"Failed to create PostgreSQL engine: {str(e)}")
                raise

        return self._engines['postgres']

    def get_dynamodb_client(self) -> boto3.client:
        """Returns DynamoDB client with enhanced security"""
        if 'dynamodb' not in self._clients:
            try:
                client = get_client(
                    'dynamodb',
                    config={
                        'retries': {'max_attempts': DEFAULT_RETRY_COUNT},
                        'connect_timeout': DEFAULT_POOL_TIMEOUT
                    }
                )
                self._clients['dynamodb'] = client
                logger.info("DynamoDB client created with security controls")

            except Exception as e:
                logger.error(f"Failed to create DynamoDB client: {str(e)}")
                raise

        return self._clients['dynamodb']

    def get_redis_client(self) -> Redis:
        """Returns Redis client with SSL and monitoring"""
        if 'redis' not in self._clients:
            try:
                redis_config = self._config['redis_config']
                client = Redis(
                    host=redis_config.host,
                    port=redis_config.port,
                    password=redis_config.password,
                    ssl=True,
                    ssl_cert_reqs=SSL_VERIFY_MODE,
                    ssl_context=self._ssl_contexts['redis'],
                    socket_timeout=DEFAULT_POOL_TIMEOUT,
                    retry_on_timeout=True,
                    health_check_interval=CONNECTION_MONITOR_INTERVAL
                )
                self._clients['redis'] = client
                logger.info("Redis client created with SSL security")

            except Exception as e:
                logger.error(f"Failed to create Redis client: {str(e)}")
                raise

        return self._clients['redis']

    def get_opensearch_client(self) -> OpenSearch:
        """Returns OpenSearch client with security features"""
        if 'opensearch' not in self._clients:
            try:
                os_config = self._config['opensearch_config']
                client = OpenSearch(
                    hosts=[{'host': os_config.host, 'port': os_config.port}],
                    http_auth=(os_config.username, os_config.password),
                    use_ssl=True,
                    verify_certs=True,
                    ssl_context=self._ssl_contexts['opensearch'],
                    timeout=DEFAULT_POOL_TIMEOUT,
                    retry_on_timeout=True,
                    max_retries=DEFAULT_RETRY_COUNT
                )
                self._clients['opensearch'] = client
                logger.info("OpenSearch client created with security features")

            except Exception as e:
                logger.error(f"Failed to create OpenSearch client: {str(e)}")
                raise

        return self._clients['opensearch']

    def monitor_connections(self) -> Dict[str, Any]:
        """Monitors database connection health and statistics"""
        try:
            stats = {}
            
            # Monitor PostgreSQL
            if 'postgres' in self._engines:
                engine = self._engines['postgres']
                with engine.connect() as conn:
                    stats['postgres'] = {
                        'pool_size': engine.pool.size(),
                        'checkedin': engine.pool.checkedin(),
                        'overflow': engine.pool.overflow(),
                        'checkedout': engine.pool.checkedout()
                    }

            # Monitor DynamoDB
            if 'dynamodb' in self._clients:
                client = self._clients['dynamodb']
                stats['dynamodb'] = {
                    'table_count': len(client.list_tables()['TableNames']),
                    'request_count': self._connection_stats['dynamodb']['requests']
                }

            # Monitor Redis
            if 'redis' in self._clients:
                client = self._clients['redis']
                stats['redis'] = {
                    'connected': client.ping(),
                    'used_memory': client.info()['used_memory'],
                    'connected_clients': client.info()['connected_clients']
                }

            # Monitor OpenSearch
            if 'opensearch' in self._clients:
                client = self._clients['opensearch']
                cluster_health = client.cluster.health()
                stats['opensearch'] = {
                    'status': cluster_health['status'],
                    'active_shards': cluster_health['active_shards'],
                    'nodes': cluster_health['number_of_nodes']
                }

            logger.info("Connection monitoring completed successfully")
            return stats

        except Exception as e:
            logger.error(f"Connection monitoring failed: {str(e)}")
            raise

def create_database_manager() -> DatabaseManager:
    """Creates and returns singleton database manager instance with security"""
    try:
        settings = get_settings()
        return DatabaseManager(config=settings.dict())
    except Exception as e:
        logger.error(f"Failed to create database manager: {str(e)}")
        raise

def init_databases() -> bool:
    """Initializes all database connections with security verification"""
    try:
        db_manager = create_database_manager()
        
        # Initialize and verify all database connections
        db_manager.get_postgres_engine()
        db_manager.get_dynamodb_client()
        db_manager.get_redis_client()
        db_manager.get_opensearch_client()
        
        # Verify connection health
        connection_stats = db_manager.monitor_connections()
        logger.info(f"All database connections initialized successfully: {connection_stats}")
        
        return True

    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        raise

__all__ = ['DatabaseManager', 'create_database_manager', 'init_databases']