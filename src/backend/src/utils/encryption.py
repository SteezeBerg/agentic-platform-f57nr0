"""
Enterprise-grade encryption utility module for Agent Builder Hub.
Provides secure data encryption and decryption services using AWS KMS with enhanced envelope encryption,
comprehensive audit logging, and PII protection features.
Version: 1.0.0
"""

import base64
import json
from typing import Union, Dict, Optional
from dataclasses import dataclass
from datetime import datetime

# Third-party imports with versions
from cryptography.fernet import Fernet  # ^41.0.0
from prometheus_client import Counter, Histogram  # ^0.17.0
from aws_pii_detector import PIIDetector  # ^2.0.0

# Internal imports
from ..integrations.aws.kms import KMSClient
from .logging import StructuredLogger

# Initialize logger
logger = StructuredLogger('utils.encryption')

# Default encryption context
DEFAULT_ENCRYPTION_CONTEXT = {
    "application": "agent-builder-hub",
    "environment": "${environment}",
    "version": "${app_version}",
    "purpose": "data_protection"
}

# Initialize metrics
METRICS = {
    'encryption_operations': Counter(
        'encryption_operations_total',
        'Total number of encryption/decryption operations',
        ['operation', 'status']
    ),
    'operation_duration': Histogram(
        'encryption_operation_duration_seconds',
        'Duration of encryption operations',
        ['operation']
    )
}

@dataclass
class EncryptionMetadata:
    """Metadata for encrypted data tracking and validation."""
    version: str = "1.0"
    timestamp: str = datetime.utcnow().isoformat()
    key_id: str = ""
    contains_pii: bool = False
    encryption_context: Dict = None

class EncryptionService:
    """Enhanced service class providing enterprise-grade encryption operations using AWS KMS."""

    def __init__(self, 
                 key_id: str,
                 encryption_context: Optional[Dict[str, str]] = None,
                 enable_key_rotation: bool = True,
                 key_cache_ttl: int = 300):
        """
        Initialize encryption service with enhanced security configuration.
        
        Args:
            key_id: AWS KMS key ID or ARN
            encryption_context: Additional encryption context
            enable_key_rotation: Enable automatic key rotation
            key_cache_ttl: Cache TTL for data keys in seconds
        """
        self._kms_client = KMSClient(encryption_context or DEFAULT_ENCRYPTION_CONTEXT)
        self._key_id = key_id
        self._encryption_context = encryption_context or DEFAULT_ENCRYPTION_CONTEXT
        self._pii_detector = PIIDetector()
        
        # Validate and configure key rotation
        if enable_key_rotation:
            self._configure_key_rotation()
            
        logger.log('info', 'Initialized encryption service', {
            'key_id': key_id,
            'key_rotation_enabled': enable_key_rotation,
            'cache_ttl': key_cache_ttl
        })

    def _configure_key_rotation(self) -> None:
        """Configure automatic key rotation with AWS KMS."""
        try:
            key_metadata = self._kms_client.get_key_metadata(self._key_id)
            if not key_metadata.get('KeyRotationEnabled'):
                logger.log('warning', 'Key rotation not enabled, enabling...')
                self._kms_client.enable_key_rotation(self._key_id)
        except Exception as e:
            logger.log('error', 'Failed to configure key rotation', {'error': str(e)})
            raise

    def encrypt_data(self, data: Union[str, bytes], check_pii: bool = True) -> str:
        """
        Encrypts data using enhanced envelope encryption with PII detection.
        
        Args:
            data: Data to encrypt
            check_pii: Enable PII detection
            
        Returns:
            Base64 encoded encrypted data with metadata
        """
        try:
            # Convert string to bytes if needed
            if isinstance(data, str):
                data = data.encode('utf-8')

            # Check for PII if enabled
            contains_pii = False
            if check_pii:
                contains_pii = bool(self._pii_detector.detect(data.decode('utf-8')))
                if contains_pii:
                    logger.log('warning', 'PII detected in data')

            # Generate data key
            data_key = self._kms_client.generate_data_key(self._key_id)

            # Perform envelope encryption
            f = Fernet(base64.b64encode(data_key['plaintext']))
            encrypted_data = f.encrypt(data)

            # Prepare metadata
            metadata = EncryptionMetadata(
                key_id=self._key_id,
                contains_pii=contains_pii,
                encryption_context=self._encryption_context
            )

            # Combine encrypted data key and encrypted data
            encrypted_package = {
                'metadata': metadata.__dict__,
                'encrypted_key': base64.b64encode(data_key['ciphertext']).decode('utf-8'),
                'encrypted_data': base64.b64encode(encrypted_data).decode('utf-8')
            }

            # Track metrics
            METRICS['encryption_operations'].labels(operation='encrypt', status='success').inc()

            return base64.b64encode(json.dumps(encrypted_package).encode('utf-8')).decode('utf-8')

        except Exception as e:
            METRICS['encryption_operations'].labels(operation='encrypt', status='error').inc()
            logger.log('error', 'Encryption failed', {'error': str(e)})
            raise

    def decrypt_data(self, encrypted_data: str, verify_metadata: bool = True) -> str:
        """
        Decrypts data with enhanced security validation.
        
        Args:
            encrypted_data: Encrypted data package
            verify_metadata: Enable metadata verification
            
        Returns:
            Decrypted data
        """
        try:
            # Decode and parse encrypted package
            encrypted_package = json.loads(base64.b64decode(encrypted_data))
            
            # Validate metadata if enabled
            if verify_metadata:
                metadata = encrypted_package.get('metadata', {})
                if metadata.get('key_id') != self._key_id:
                    raise ValueError("Key ID mismatch")
                if metadata.get('contains_pii'):
                    logger.log('warning', 'Decrypting PII-containing data')

            # Decrypt the data key
            encrypted_key = base64.b64decode(encrypted_package['encrypted_key'])
            data_key = self._kms_client.decrypt(encrypted_key, self._encryption_context)

            # Decrypt the data using the decrypted data key
            f = Fernet(base64.b64encode(data_key))
            decrypted_data = f.decrypt(base64.b64decode(encrypted_package['encrypted_data']))

            # Track metrics
            METRICS['encryption_operations'].labels(operation='decrypt', status='success').inc()

            return decrypted_data.decode('utf-8')

        except Exception as e:
            METRICS['encryption_operations'].labels(operation='decrypt', status='error').inc()
            logger.log('error', 'Decryption failed', {'error': str(e)})
            raise

def encrypt_string(value: str, key_id: str, check_pii: bool = True) -> str:
    """
    Enhanced utility function for string encryption with PII detection.
    
    Args:
        value: String to encrypt
        key_id: KMS key ID
        check_pii: Enable PII detection
        
    Returns:
        Encrypted string with metadata
    """
    encryption_service = EncryptionService(key_id)
    return encryption_service.encrypt_data(value, check_pii)

def decrypt_string(encrypted_value: str, key_id: str, verify_metadata: bool = True) -> str:
    """
    Enhanced utility function for string decryption with validation.
    
    Args:
        encrypted_value: Encrypted string
        key_id: KMS key ID
        verify_metadata: Enable metadata verification
        
    Returns:
        Decrypted string
    """
    encryption_service = EncryptionService(key_id)
    return encryption_service.decrypt_data(encrypted_value, verify_metadata)

__all__ = ['EncryptionService', 'encrypt_string', 'decrypt_string']