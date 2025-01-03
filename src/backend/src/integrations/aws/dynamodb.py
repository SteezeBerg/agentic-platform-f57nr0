"""
AWS DynamoDB integration module providing high-level access patterns and operations.
Implements enterprise-grade database operations with enhanced security, performance optimization,
and comprehensive monitoring capabilities.
Version: 1.0.0
"""

import json
import time
from typing import Dict, List, Optional, Any, Union
from functools import wraps
from concurrent.futures import ThreadPoolExecutor

# Third-party imports with versions
import boto3  # ^1.28.0
from botocore.exceptions import ClientError, DynamoDBOperationNotSupportedError  # ^1.31.0
from tenacity import retry, stop_after_attempt, wait_exponential  # ^8.2.2

# Internal imports
from ...config.aws import get_client
from ...utils.logging import StructuredLogger
from ...utils.metrics import track_time
from ...utils.encryption import encrypt_string, decrypt_string

# Initialize logger
logger = StructuredLogger('dynamodb')

# Constants
MAX_BATCH_SIZE = 25
DEFAULT_TTL = 86400  # 24 hours
MAX_RETRIES = 3
BACKOFF_BASE = 2
SENSITIVE_FIELDS = ['password', 'api_key', 'token']

class DynamoDBClient:
    """Enhanced DynamoDB client wrapper providing optimized access patterns with security,
    monitoring, and performance features."""

    def __init__(self, table_name: str, config: Optional[Dict] = None, encryption_config: Optional[Dict] = None):
        """Initialize DynamoDB client with enhanced configuration and security validation.
        
        Args:
            table_name: Name of the DynamoDB table
            config: Optional configuration overrides
            encryption_config: Optional encryption settings
        """
        self.table_name = table_name
        self._client = get_client('dynamodb')
        self.default_config = {
            'consistent_read': False,
            'enable_encryption': True,
            'batch_size': MAX_BATCH_SIZE,
            'ttl_enabled': True,
            'ttl_attribute': 'expires_at',
            'ttl_default': DEFAULT_TTL
        }
        self.default_config.update(config or {})
        self.encryption_config = encryption_config or {}
        
        # Initialize connection pool
        self.connection_pool = ThreadPoolExecutor(max_workers=10)
        
        # Validate table existence and configuration
        self._validate_table()
        
        logger.log('info', f'Initialized DynamoDB client for table: {table_name}')

    def _validate_table(self) -> None:
        """Validate table existence and configuration."""
        try:
            response = self._client.describe_table(TableName=self.table_name)
            if not response.get('Table'):
                raise ValueError(f"Table {self.table_name} not found")
            
            # Validate TTL configuration if enabled
            if self.default_config['ttl_enabled']:
                ttl_response = self._client.describe_time_to_live(TableName=self.table_name)
                if ttl_response['TimeToLiveDescription']['TimeToLiveStatus'] != 'ENABLED':
                    logger.warn('TTL not enabled for table', {'table': self.table_name})
                    
        except ClientError as e:
            logger.error('Table validation failed', {'error': str(e)})
            raise

    @track_time('dynamodb_get')
    def get_item(self, key: Dict[str, Any], consistent_read: bool = False, 
                 decrypt_fields: bool = True) -> Optional[Dict]:
        """Retrieves a single item with encryption and performance optimization.
        
        Args:
            key: Primary key of the item
            consistent_read: Enable consistent read
            decrypt_fields: Decrypt sensitive fields
            
        Returns:
            Item data or None if not found
        """
        try:
            response = self._client.get_item(
                TableName=self.table_name,
                Key=key,
                ConsistentRead=consistent_read
            )
            
            item = response.get('Item')
            if not item:
                return None
                
            # Decrypt sensitive fields if required
            if decrypt_fields and self.default_config['enable_encryption']:
                for field in SENSITIVE_FIELDS:
                    if field in item:
                        item[field] = decrypt_string(
                            item[field], 
                            self.encryption_config.get('key_id'),
                            verify_metadata=True
                        )
            
            return item
            
        except ClientError as e:
            logger.error('Get item failed', {
                'error': str(e),
                'table': self.table_name,
                'key': key
            })
            raise

    @track_time('dynamodb_put')
    def put_item(self, item: Dict[str, Any], condition_expression: Optional[Dict] = None,
                 encrypt_fields: bool = True) -> Dict:
        """Stores an item with encryption and optimized write operations.
        
        Args:
            item: Item data to store
            condition_expression: Optional condition for put operation
            encrypt_fields: Encrypt sensitive fields
            
        Returns:
            Operation response with metrics
        """
        try:
            # Encrypt sensitive fields if required
            if encrypt_fields and self.default_config['enable_encryption']:
                for field in SENSITIVE_FIELDS:
                    if field in item:
                        item[field] = encrypt_string(
                            item[field],
                            self.encryption_config.get('key_id'),
                            check_pii=True
                        )
            
            # Add TTL if enabled
            if self.default_config['ttl_enabled']:
                item[self.default_config['ttl_attribute']] = int(
                    time.time() + self.default_config['ttl_default']
                )
            
            params = {
                'TableName': self.table_name,
                'Item': item
            }
            
            if condition_expression:
                params.update(condition_expression)
            
            response = self._client.put_item(**params)
            
            logger.log('info', 'Item stored successfully', {
                'table': self.table_name,
                'item_size': len(str(item))
            })
            
            return response
            
        except ClientError as e:
            logger.error('Put item failed', {
                'error': str(e),
                'table': self.table_name
            })
            raise

    @track_time('dynamodb_batch_write')
    def batch_write(self, items: List[Dict[str, Any]], encrypt_fields: bool = True) -> Dict:
        """Optimized batch write operations with automatic retry and chunking.
        
        Args:
            items: List of items to write
            encrypt_fields: Encrypt sensitive fields
            
        Returns:
            Batch operation results with metrics
        """
        if not items:
            return {'UnprocessedItems': {}}
            
        try:
            # Process items in chunks
            chunk_size = min(MAX_BATCH_SIZE, len(items))
            chunks = [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]
            
            unprocessed_items = []
            for chunk in chunks:
                # Encrypt sensitive fields if required
                if encrypt_fields and self.default_config['enable_encryption']:
                    for item in chunk:
                        for field in SENSITIVE_FIELDS:
                            if field in item:
                                item[field] = encrypt_string(
                                    item[field],
                                    self.encryption_config.get('key_id'),
                                    check_pii=True
                                )
                
                # Prepare batch request
                request_items = {
                    self.table_name: [{'PutRequest': {'Item': item}} for item in chunk]
                }
                
                # Execute batch write with retries
                response = self._batch_write_with_retries(request_items)
                if response.get('UnprocessedItems'):
                    unprocessed_items.extend(response['UnprocessedItems'])
            
            return {'UnprocessedItems': unprocessed_items}
            
        except Exception as e:
            logger.error('Batch write failed', {
                'error': str(e),
                'table': self.table_name,
                'items_count': len(items)
            })
            raise

    @track_time('dynamodb_query')
    def query(self, key_condition: Dict[str, Any], filter_expression: Optional[Dict] = None,
              index_name: Optional[str] = None, decrypt_fields: bool = True) -> Dict:
        """Executes optimized query operations with result processing.
        
        Args:
            key_condition: Key condition expression
            filter_expression: Optional filter expression
            index_name: Optional secondary index name
            decrypt_fields: Decrypt sensitive fields
            
        Returns:
            Query results with pagination and metrics
        """
        try:
            params = {
                'TableName': self.table_name,
                'KeyConditionExpression': key_condition
            }
            
            if filter_expression:
                params.update(filter_expression)
            if index_name:
                params['IndexName'] = index_name
            
            response = self._client.query(**params)
            
            # Decrypt sensitive fields if required
            if decrypt_fields and self.default_config['enable_encryption']:
                for item in response.get('Items', []):
                    for field in SENSITIVE_FIELDS:
                        if field in item:
                            item[field] = decrypt_string(
                                item[field],
                                self.encryption_config.get('key_id'),
                                verify_metadata=True
                            )
            
            return response
            
        except ClientError as e:
            logger.error('Query failed', {
                'error': str(e),
                'table': self.table_name,
                'index': index_name
            })
            raise

    @track_time('dynamodb_transaction')
    def transact_write(self, operations: List[Dict[str, Any]], encrypt_fields: bool = True) -> Dict:
        """Executes atomic transaction operations with enhanced error handling.
        
        Args:
            operations: List of transaction operations
            encrypt_fields: Encrypt sensitive fields
            
        Returns:
            Transaction results with detailed metrics
        """
        try:
            # Encrypt sensitive fields in transaction items if required
            if encrypt_fields and self.default_config['enable_encryption']:
                for operation in operations:
                    if 'Put' in operation:
                        item = operation['Put']['Item']
                        for field in SENSITIVE_FIELDS:
                            if field in item:
                                item[field] = encrypt_string(
                                    item[field],
                                    self.encryption_config.get('key_id'),
                                    check_pii=True
                                )
            
            response = self._client.transact_write_items(
                TransactItems=operations
            )
            
            logger.log('info', 'Transaction completed successfully', {
                'table': self.table_name,
                'operations_count': len(operations)
            })
            
            return response
            
        except ClientError as e:
            logger.error('Transaction failed', {
                'error': str(e),
                'table': self.table_name,
                'operations_count': len(operations)
            })
            raise

    @retry(stop=stop_after_attempt(MAX_RETRIES),
           wait=wait_exponential(multiplier=BACKOFF_BASE))
    def _batch_write_with_retries(self, request_items: Dict) -> Dict:
        """Execute batch write with exponential backoff retry logic."""
        return self._client.batch_write_item(RequestItems=request_items)

__all__ = ['DynamoDBClient']