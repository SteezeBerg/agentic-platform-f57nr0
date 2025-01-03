"""
Confluence integration module for Agent Builder Hub.
Provides secure, monitored, and optimized content extraction from Confluence for knowledge base indexing.
Version: 1.0.0
"""

import asyncio
from typing import Dict, List, Optional, Any, AsyncGenerator
from datetime import datetime
import json
import re

# Third-party imports
import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field, validator

# Internal imports
from config.settings import get_settings
from utils.logging import StructuredLogger
from core.knowledge.indexer import KnowledgeIndexer
from schemas.knowledge import KnowledgeSourceBase

# Global constants
API_VERSION = 'v1'
MAX_RETRIES = 3
BATCH_SIZE = 50
DEFAULT_TIMEOUT = 30
RATE_LIMIT_REQUESTS = 100
RATE_LIMIT_PERIOD = 60
CONNECTION_POOL_SIZE = 20
CIRCUIT_BREAKER_THRESHOLD = 5

class ConfluenceConfig(BaseModel):
    """Enhanced Pydantic model for Confluence connection configuration."""
    
    base_url: str = Field(..., description="Confluence base URL")
    username: str = Field(..., description="API username")
    api_token: str = Field(..., description="API token")
    space_key: Optional[str] = Field(None, description="Specific space key to sync")
    labels: Optional[List[str]] = Field(None, description="Filter content by labels")
    rate_limit: Optional[int] = Field(RATE_LIMIT_REQUESTS, description="Rate limit per minute")
    timeout: Optional[int] = Field(DEFAULT_TIMEOUT, description="Request timeout in seconds")
    ssl_config: Optional[Dict] = Field(None, description="SSL configuration")

    @validator('base_url')
    def validate_base_url(cls, v):
        """Validate base URL format."""
        if not v.startswith(('http://', 'https://')):
            raise ValueError("Base URL must start with http:// or https://")
        return v.rstrip('/')

    @validator('api_token')
    def validate_api_token(cls, v):
        """Validate API token format."""
        if not v or len(v) < 32:
            raise ValueError("Invalid API token format")
        return v

class ConfluenceClient:
    """Enhanced client for Confluence API communication."""

    def __init__(self, config: ConfluenceConfig):
        """Initialize Confluence client with monitoring."""
        self._config = config
        self._logger = StructuredLogger('confluence_client', {
            'service': 'confluence',
            'base_url': config.base_url
        })
        
        # Initialize session with connection pooling
        self._session = aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(
                limit=CONNECTION_POOL_SIZE,
                ssl=config.ssl_config
            ),
            timeout=aiohttp.ClientTimeout(total=config.timeout),
            headers={
                'Authorization': f'Basic {self._encode_credentials()}',
                'Content-Type': 'application/json'
            }
        )
        
        # Initialize rate limiting
        self._rate_limit = {
            'tokens': config.rate_limit,
            'last_reset': datetime.now(),
            'period': RATE_LIMIT_PERIOD
        }
        
        # Initialize metrics
        self._metrics = {
            'requests': 0,
            'errors': 0,
            'rate_limited': 0
        }

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._session.close()

    def _encode_credentials(self) -> str:
        """Encode API credentials securely."""
        import base64
        creds = f"{self._config.username}:{self._config.api_token}"
        return base64.b64encode(creds.encode()).decode()

    async def _check_rate_limit(self):
        """Implement rate limiting control."""
        now = datetime.now()
        if (now - self._rate_limit['last_reset']).seconds >= self._rate_limit['period']:
            self._rate_limit['tokens'] = self._config.rate_limit
            self._rate_limit['last_reset'] = now
        
        if self._rate_limit['tokens'] <= 0:
            self._metrics['rate_limited'] += 1
            wait_time = self._rate_limit['period'] - (now - self._rate_limit['last_reset']).seconds
            await asyncio.sleep(wait_time)
            self._rate_limit['tokens'] = self._config.rate_limit
        
        self._rate_limit['tokens'] -= 1

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def get_content(
        self,
        space_key: Optional[str] = None,
        labels: Optional[List[str]] = None
    ) -> AsyncGenerator[Dict, None]:
        """Retrieve content from Confluence with pagination."""
        try:
            start = 0
            limit = BATCH_SIZE
            
            while True:
                await self._check_rate_limit()
                
                # Build query parameters
                params = {
                    'start': start,
                    'limit': limit,
                    'expand': 'body.storage,version,space,metadata.labels',
                    'status': 'current'
                }
                
                if space_key:
                    params['spaceKey'] = space_key
                if labels:
                    params['label'] = labels

                # Execute request with monitoring
                async with self._session.get(
                    f"{self._config.base_url}/rest/api/{API_VERSION}/content",
                    params=params
                ) as response:
                    self._metrics['requests'] += 1
                    
                    if response.status != 200:
                        self._metrics['errors'] += 1
                        raise aiohttp.ClientError(f"API request failed: {response.status}")
                    
                    data = await response.json()
                    results = data.get('results', [])
                    
                    if not results:
                        break
                    
                    # Process and yield results
                    for content in results:
                        yield self._process_content(content)
                    
                    start += limit
                    if start >= data.get('size', 0):
                        break

        except Exception as e:
            self._logger.log('error', f"Content retrieval failed: {str(e)}")
            raise

    def _process_content(self, content: Dict) -> Dict:
        """Process and clean Confluence content."""
        try:
            body_html = content.get('body', {}).get('storage', {}).get('value', '')
            soup = BeautifulSoup(body_html, 'html.parser')
            
            # Clean HTML content
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Extract text with structure preservation
            text = soup.get_text(separator='\n', strip=True)
            text = re.sub(r'\n\s*\n', '\n\n', text)
            
            return {
                'id': content['id'],
                'title': content['title'],
                'space_key': content.get('space', {}).get('key'),
                'content': text,
                'version': content['version']['number'],
                'last_modified': content['version']['when'],
                'labels': [
                    label['name'] 
                    for label in content.get('metadata', {}).get('labels', {}).get('results', [])
                ],
                'url': f"{self._config.base_url}/display/{content['space']['key']}/{content['id']}"
            }
            
        except Exception as e:
            self._logger.log('error', f"Content processing failed: {str(e)}")
            raise

class ConfluenceConnector:
    """Enhanced main connector for Confluence integration."""

    def __init__(self, config: ConfluenceConfig, indexer: KnowledgeIndexer):
        """Initialize Confluence connector with monitoring."""
        self._config = config
        self._indexer = indexer
        self._logger = StructuredLogger('confluence_connector', {
            'service': 'confluence',
            'base_url': config.base_url
        })
        self._client = ConfluenceClient(config)

    async def sync_content(
        self,
        space_key: Optional[str] = None,
        labels: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Synchronize Confluence content to knowledge base."""
        try:
            start_time = datetime.now()
            sync_stats = {
                'processed': 0,
                'indexed': 0,
                'errors': 0,
                'start_time': start_time.isoformat()
            }

            async with self._client as client:
                # Process content in batches
                batch = []
                async for content in client.get_content(space_key, labels):
                    sync_stats['processed'] += 1
                    
                    # Prepare content for indexing
                    index_content = {
                        'content': content['content'],
                        'metadata': {
                            'source': 'confluence',
                            'id': content['id'],
                            'title': content['title'],
                            'space_key': content['space_key'],
                            'version': content['version'],
                            'last_modified': content['last_modified'],
                            'labels': content['labels'],
                            'url': content['url']
                        }
                    }
                    batch.append(index_content)
                    
                    # Process batch when full
                    if len(batch) >= BATCH_SIZE:
                        indexed = await self._process_batch(batch)
                        sync_stats['indexed'] += indexed
                        batch = []

                # Process remaining items
                if batch:
                    indexed = await self._process_batch(batch)
                    sync_stats['indexed'] += indexed

            # Calculate final statistics
            end_time = datetime.now()
            sync_stats.update({
                'end_time': end_time.isoformat(),
                'duration_seconds': (end_time - start_time).total_seconds(),
                'success_rate': (
                    (sync_stats['indexed'] / sync_stats['processed']) * 100
                    if sync_stats['processed'] > 0 else 0
                )
            })

            self._logger.log('info', 'Content sync completed', sync_stats)
            return sync_stats

        except Exception as e:
            self._logger.log('error', f"Content sync failed: {str(e)}")
            raise

    async def _process_batch(self, batch: List[Dict]) -> int:
        """Process a batch of content items."""
        try:
            # Extract content and metadata
            contents = [item['content'] for item in batch]
            metadata = [item['metadata'] for item in batch]
            
            # Index batch
            result = await self._indexer.batch_index_content(contents, metadata)
            return result['successful']
            
        except Exception as e:
            self._logger.log('error', f"Batch processing failed: {str(e)}")
            return 0

    async def validate_connection(self) -> Dict[str, Any]:
        """Validate Confluence connection and credentials."""
        try:
            async with self._client as client:
                test_content = [c async for c in client.get_content(limit=1)]
                
                return {
                    'status': 'connected',
                    'base_url': self._config.base_url,
                    'timestamp': datetime.now().isoformat(),
                    'content_accessible': len(test_content) > 0
                }
                
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }