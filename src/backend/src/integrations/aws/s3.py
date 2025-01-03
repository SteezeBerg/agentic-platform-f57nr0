"""
AWS S3 integration module providing high-level S3 operations for the Agent Builder Hub.
Implements secure file storage, retrieval, and management capabilities with enhanced
security controls, monitoring, and intelligent tiering support.
Version: 1.0.0
"""

import os
from typing import Dict, Optional, Union, BinaryIO
from functools import wraps

# Third-party imports with versions
import boto3  # ^1.28.0
from botocore.exceptions import ClientError, BotoCoreError  # ^1.31.0

# Internal imports
from ...config.aws import get_client
from ...utils.logging import StructuredLogger
from ...utils.metrics import track_time

# Global constants
DEFAULT_EXPIRES = 3600  # Default URL expiration in seconds
STORAGE_CLASSES = {
    "STANDARD": "STANDARD",
    "INTELLIGENT_TIERING": "INTELLIGENT_TIERING", 
    "STANDARD_IA": "STANDARD_IA",
    "GLACIER": "GLACIER"
}
MAX_RETRIES = 3
MULTIPART_THRESHOLD = 1024 * 1024 * 100  # 100MB
MAX_CONCURRENCY = 10

class S3Client:
    """Enhanced S3 client wrapper providing secure storage operations with intelligent tiering,
    lifecycle management, and performance monitoring."""

    @track_time('s3_operations')
    def __init__(
        self,
        bucket_name: str,
        config: Optional[Dict] = None,
        encryption_config: Optional[Dict] = None,
        lifecycle_config: Optional[Dict] = None
    ):
        """Initialize S3 client with enhanced configuration.

        Args:
            bucket_name: Target S3 bucket name
            config: Additional S3 configuration
            encryption_config: Encryption settings
            lifecycle_config: Lifecycle management rules
        """
        self._client = get_client('s3')
        self._logger = StructuredLogger('s3_client', {'service': 's3'})
        self.default_bucket = bucket_name

        # Initialize encryption configuration
        self.encryption_config = {
            'ServerSideEncryption': 'aws:kms',
            'SSEKMSKeyId': encryption_config.get('kms_key_id') if encryption_config else None
        }

        # Initialize lifecycle configuration
        self.lifecycle_config = lifecycle_config or {
            'Rules': [
                {
                    'ID': 'intelligent_tiering',
                    'Status': 'Enabled',
                    'Transitions': [
                        {
                            'Days': 30,
                            'StorageClass': 'INTELLIGENT_TIERING'
                        }
                    ]
                }
            ]
        }

        # Initialize performance metrics tracking
        self.performance_metrics = {
            'operations': 0,
            'errors': 0,
            'bytes_transferred': 0
        }

        # Validate bucket and configuration
        self._validate_bucket()

    def _validate_bucket(self) -> None:
        """Validate bucket existence and configuration."""
        try:
            self._client.head_bucket(Bucket=self.default_bucket)
            
            # Apply lifecycle configuration
            self._client.put_bucket_lifecycle_configuration(
                Bucket=self.default_bucket,
                LifecycleConfiguration=self.lifecycle_config
            )
            
            self._logger.log('info', f"Successfully validated bucket: {self.default_bucket}")
        except ClientError as e:
            self._logger.log('error', f"Bucket validation failed: {str(e)}")
            raise

    @track_time('s3_upload')
    def upload_file(
        self,
        file_path: Union[str, BinaryIO],
        key: str,
        storage_class: str = STORAGE_CLASSES['STANDARD'],
        tags: Optional[Dict[str, str]] = None,
        multipart: bool = True
    ) -> Dict:
        """Upload file to S3 with encryption and intelligent tiering.

        Args:
            file_path: Local file path or file-like object
            key: S3 object key
            storage_class: Storage class for the object
            tags: Object tags
            multipart: Enable multipart upload for large files

        Returns:
            Dict containing upload response metadata
        """
        try:
            # Prepare upload configuration
            config = {
                'StorageClass': storage_class,
                **self.encryption_config
            }

            if tags:
                config['Tagging'] = '&'.join([f"{k}={v}" for k, v in tags.items()])

            # Configure multipart upload if enabled
            transfer_config = None
            if multipart:
                transfer_config = boto3.s3.transfer.TransferConfig(
                    multipart_threshold=MULTIPART_THRESHOLD,
                    max_concurrency=MAX_CONCURRENCY
                )

            # Perform upload
            if isinstance(file_path, str):
                response = self._client.upload_file(
                    file_path,
                    self.default_bucket,
                    key,
                    ExtraArgs=config,
                    Config=transfer_config
                )
            else:
                response = self._client.upload_fileobj(
                    file_path,
                    self.default_bucket,
                    key,
                    ExtraArgs=config,
                    Config=transfer_config
                )

            # Track metrics
            self.performance_metrics['operations'] += 1
            if isinstance(file_path, str):
                self.performance_metrics['bytes_transferred'] += os.path.getsize(file_path)

            self._logger.log('info', f"Successfully uploaded file to {key}")
            return {
                'status': 'success',
                'bucket': self.default_bucket,
                'key': key,
                'storage_class': storage_class,
                'encryption': self.encryption_config['ServerSideEncryption'],
                'tags': tags
            }

        except (ClientError, BotoCoreError) as e:
            self.performance_metrics['errors'] += 1
            self._logger.log('error', f"Upload failed for {key}: {str(e)}")
            raise

    @track_time('s3_download')
    def download_file(
        self,
        key: str,
        destination_path: str,
        version_id: Optional[str] = None
    ) -> Dict:
        """Download file from S3 with validation.

        Args:
            key: S3 object key
            destination_path: Local destination path
            version_id: Specific version to download

        Returns:
            Dict containing download response metadata
        """
        try:
            # Prepare download configuration
            config = {'VersionId': version_id} if version_id else {}

            # Perform download
            response = self._client.download_file(
                self.default_bucket,
                key,
                destination_path,
                ExtraArgs=config
            )

            # Track metrics
            self.performance_metrics['operations'] += 1
            self.performance_metrics['bytes_transferred'] += os.path.getsize(destination_path)

            self._logger.log('info', f"Successfully downloaded file from {key}")
            return {
                'status': 'success',
                'bucket': self.default_bucket,
                'key': key,
                'destination': destination_path,
                'version_id': version_id
            }

        except (ClientError, BotoCoreError) as e:
            self.performance_metrics['errors'] += 1
            self._logger.log('error', f"Download failed for {key}: {str(e)}")
            raise

    def generate_presigned_url(
        self,
        key: str,
        operation: str = 'get_object',
        expires: int = DEFAULT_EXPIRES,
        security_headers: Optional[Dict] = None
    ) -> str:
        """Generate secure presigned URL with enhanced controls.

        Args:
            key: S3 object key
            operation: S3 operation type
            expires: URL expiration time in seconds
            security_headers: Additional security headers

        Returns:
            Secure presigned URL
        """
        try:
            # Prepare URL configuration
            params = {
                'Bucket': self.default_bucket,
                'Key': key,
                **self.encryption_config
            }

            if security_headers:
                params.update(security_headers)

            # Generate URL
            url = self._client.generate_presigned_url(
                operation,
                Params=params,
                ExpiresIn=expires
            )

            self._logger.log('info', f"Generated presigned URL for {key}")
            return url

        except (ClientError, BotoCoreError) as e:
            self._logger.log('error', f"URL generation failed for {key}: {str(e)}")
            raise

    @track_time('s3_delete')
    def delete_object(
        self,
        key: str,
        permanent: bool = False,
        version_id: Optional[str] = None
    ) -> Dict:
        """Delete object from S3 with versioning support.

        Args:
            key: S3 object key
            permanent: Permanently delete object
            version_id: Specific version to delete

        Returns:
            Dict containing delete response metadata
        """
        try:
            # Prepare delete configuration
            config = {'VersionId': version_id} if version_id else {}

            if permanent:
                response = self._client.delete_object(
                    Bucket=self.default_bucket,
                    Key=key,
                    **config
                )
            else:
                # Add delete marker instead of permanent deletion
                response = self._client.put_object(
                    Bucket=self.default_bucket,
                    Key=key,
                    DeleteMarker=True,
                    **config
                )

            self.performance_metrics['operations'] += 1
            self._logger.log('info', f"Successfully deleted object {key}")
            
            return {
                'status': 'success',
                'bucket': self.default_bucket,
                'key': key,
                'permanent': permanent,
                'version_id': version_id,
                'delete_marker': not permanent
            }

        except (ClientError, BotoCoreError) as e:
            self.performance_metrics['errors'] += 1
            self._logger.log('error', f"Delete failed for {key}: {str(e)}")
            raise