"""
AWS KMS integration module providing secure key management and encryption operations.
Implements enterprise-grade encryption using AWS KMS with comprehensive audit logging,
error handling, and compliance monitoring.
Version: 1.0.0
"""

from dataclasses import dataclass
import threading
from typing import Dict, Optional
import base64

# Third-party imports with versions
import boto3  # ^1.28.0
from botocore.exceptions import ClientError  # ^1.31.0
from tenacity import retry, stop_after_attempt, wait_exponential  # ^8.2.2

# Internal imports
from ...config.aws import get_client
from ...utils.logging import StructuredLogger

# Initialize structured logger
logger = StructuredLogger('integrations.aws.kms')

# Constants
DEFAULT_KEY_SPEC = 'AES_256'
MAX_RETRIES = 3
RETRY_DELAY_MS = 100

@dataclass
class KMSClient:
    """Thread-safe client class for AWS KMS operations providing encryption, decryption,
    and key management capabilities with comprehensive audit logging and error handling."""

    def __init__(self, encryption_context: Dict[str, str], enable_caching: bool = True):
        """Initialize thread-safe KMS client with encryption context and caching.
        
        Args:
            encryption_context: Dict containing encryption context key-value pairs
            enable_caching: Boolean to enable/disable key caching
        """
        # Initialize KMS client
        self._client = get_client('kms')
        
        # Validate encryption context
        if not isinstance(encryption_context, dict):
            raise ValueError("Encryption context must be a dictionary")
        self._encryption_context = encryption_context
        
        # Initialize key cache and lock
        self._key_cache = {} if enable_caching else None
        self._client_lock = threading.Lock()
        
        logger.log('info', 'Initialized KMS client', {
            'encryption_context_keys': list(encryption_context.keys()),
            'caching_enabled': enable_caching
        })

    @retry(stop=stop_after_attempt(MAX_RETRIES), 
           wait=wait_exponential(multiplier=RETRY_DELAY_MS))
    def encrypt(self, plaintext: bytes, key_id: str, context: Optional[Dict] = None) -> bytes:
        """Encrypts data using KMS key with retry logic and audit logging.
        
        Args:
            plaintext: Data to encrypt
            key_id: KMS key ID or ARN
            context: Optional additional encryption context
            
        Returns:
            Encrypted data as bytes
        """
        if not plaintext or not key_id:
            raise ValueError("Plaintext and key_id are required")
            
        encryption_context = {**self._encryption_context, **(context or {})}
        
        try:
            with self._client_lock:
                logger.log('info', 'Starting encryption operation', {
                    'key_id': key_id,
                    'context_keys': list(encryption_context.keys())
                })
                
                response = self._client.encrypt(
                    KeyId=key_id,
                    Plaintext=plaintext,
                    EncryptionContext=encryption_context,
                    EncryptionAlgorithm='SYMMETRIC_DEFAULT'
                )
                
                logger.audit('Encryption operation completed', {
                    'key_id': key_id,
                    'operation': 'encrypt'
                })
                
                return response['CiphertextBlob']
                
        except ClientError as e:
            logger.error('KMS encryption failed', {
                'error_code': e.response['Error']['Code'],
                'error_message': e.response['Error']['Message']
            })
            raise

    @retry(stop=stop_after_attempt(MAX_RETRIES), 
           wait=wait_exponential(multiplier=RETRY_DELAY_MS))
    def decrypt(self, ciphertext: bytes, context: Optional[Dict] = None) -> bytes:
        """Decrypts data using KMS with comprehensive error handling.
        
        Args:
            ciphertext: Encrypted data to decrypt
            context: Optional additional encryption context
            
        Returns:
            Decrypted data as bytes
        """
        if not ciphertext:
            raise ValueError("Ciphertext is required")
            
        encryption_context = {**self._encryption_context, **(context or {})}
        
        try:
            with self._client_lock:
                logger.log('info', 'Starting decryption operation', {
                    'context_keys': list(encryption_context.keys())
                })
                
                response = self._client.decrypt(
                    CiphertextBlob=ciphertext,
                    EncryptionContext=encryption_context,
                    EncryptionAlgorithm='SYMMETRIC_DEFAULT'
                )
                
                # Verify encryption context
                if response.get('EncryptionContext') != encryption_context:
                    raise ValueError("Encryption context mismatch")
                
                logger.audit('Decryption operation completed', {
                    'key_id': response.get('KeyId'),
                    'operation': 'decrypt'
                })
                
                return response['Plaintext']
                
        except ClientError as e:
            logger.error('KMS decryption failed', {
                'error_code': e.response['Error']['Code'],
                'error_message': e.response['Error']['Message']
            })
            raise

    @retry(stop=stop_after_attempt(MAX_RETRIES), 
           wait=wait_exponential(multiplier=RETRY_DELAY_MS))
    def generate_data_key(self, key_id: str, use_cache: bool = True) -> Dict[str, bytes]:
        """Generates a data key for envelope encryption with caching support.
        
        Args:
            key_id: KMS key ID or ARN
            use_cache: Whether to use key caching
            
        Returns:
            Dict containing plaintext and encrypted versions of the data key
        """
        if not key_id:
            raise ValueError("Key ID is required")
            
        # Check cache if enabled
        if use_cache and self._key_cache and key_id in self._key_cache:
            logger.log('info', 'Using cached data key', {'key_id': key_id})
            return self._key_cache[key_id]
            
        try:
            with self._client_lock:
                logger.log('info', 'Generating new data key', {
                    'key_id': key_id,
                    'key_spec': DEFAULT_KEY_SPEC
                })
                
                response = self._client.generate_data_key(
                    KeyId=key_id,
                    EncryptionContext=self._encryption_context,
                    KeySpec=DEFAULT_KEY_SPEC
                )
                
                data_key = {
                    'plaintext': response['Plaintext'],
                    'ciphertext': response['CiphertextBlob']
                }
                
                # Update cache if enabled
                if use_cache and self._key_cache is not None:
                    self._key_cache[key_id] = data_key
                
                logger.audit('Data key generation completed', {
                    'key_id': key_id,
                    'operation': 'generate_data_key'
                })
                
                return data_key
                
        except ClientError as e:
            logger.error('Data key generation failed', {
                'error_code': e.response['Error']['Code'],
                'error_message': e.response['Error']['Message'],
                'key_id': key_id
            })
            raise