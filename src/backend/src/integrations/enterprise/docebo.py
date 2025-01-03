"""
Enterprise-grade integration module for Docebo Learning Management System (LMS).
Provides secure, performant, and resilient retrieval and indexing of training content.
Version: 1.0.0
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import json

# Third-party imports with versions
import httpx  # ^0.24.0
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)  # ^8.2.0
from pydantic import BaseModel, Field, validator  # ^2.0.0
from cachetools import TTLCache  # ^5.3.0
from circuit_breaker import CircuitBreaker  # ^1.0.0

# Internal imports
from config.settings import get_settings, DoceboSettings
from utils.logging import StructuredLogger
from core.knowledge.indexer import KnowledgeIndexer
from utils.metrics import MetricsManager

# Global constants
API_VERSION = "v1"
MAX_RETRIES = 3
BATCH_SIZE = 50
CACHE_TTL = 300  # 5 minutes
HEALTH_CHECK_INTERVAL = 60  # 1 minute
PERFORMANCE_THRESHOLD_MS = 1000  # 1 second

class DoceboClient:
    """Enhanced client for secure and performant interaction with Docebo LMS API."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        secret_key: str,
        config: Optional[Dict] = None
    ):
        """Initialize the enhanced Docebo API client with security and performance features."""
        self._base_url = base_url.rstrip('/')
        self._api_key = api_key
        self._secret_key = secret_key
        
        # Initialize HTTP client with connection pooling
        self._client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
            verify=True
        )
        
        # Initialize monitoring components
        self._logger = StructuredLogger("docebo_client", {
            "service": "docebo",
            "api_version": API_VERSION
        })
        self._metrics = MetricsManager(
            namespace="AgentBuilderHub/Docebo",
            dimensions={"service": "docebo_integration"}
        )
        
        # Initialize circuit breaker
        self._circuit_breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=60,
            name="docebo_api"
        )
        
        # Initialize response cache
        self._response_cache = TTLCache(maxsize=1000, ttl=CACHE_TTL)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._client.aclose()

    def _prepare_auth_headers(self) -> Dict[str, str]:
        """Prepare secure authentication headers for API requests."""
        timestamp = datetime.utcnow().isoformat()
        return {
            "X-Docebo-Key": self._api_key,
            "X-Docebo-Timestamp": timestamp,
            "Authorization": f"Bearer {self._secret_key}"
        }

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, TimeoutError))
    )
    async def _make_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        data: Optional[Dict] = None
    ) -> Dict:
        """Make secure API request with comprehensive error handling and monitoring."""
        url = f"{self._base_url}/api/{API_VERSION}/{endpoint}"
        
        try:
            async with self._circuit_breaker:
                start_time = datetime.now()
                
                response = await self._client.request(
                    method,
                    url,
                    params=params,
                    json=data,
                    headers=self._prepare_auth_headers()
                )
                
                # Track request latency
                latency = (datetime.now() - start_time).total_seconds() * 1000
                self._metrics.track_performance(
                    "api_latency",
                    latency,
                    {"endpoint": endpoint}
                )
                
                response.raise_for_status()
                return response.json()
                
        except httpx.HTTPError as e:
            self._logger.log("error", f"HTTP error in Docebo API call: {str(e)}")
            self._metrics.track_performance("api_error", 1, {
                "error_type": "http",
                "endpoint": endpoint
            })
            raise
        
        except Exception as e:
            self._logger.log("error", f"Error in Docebo API call: {str(e)}")
            self._metrics.track_performance("api_error", 1, {
                "error_type": "general",
                "endpoint": endpoint
            })
            raise

    async def get_courses(
        self,
        page: int = 1,
        page_size: int = BATCH_SIZE,
        filters: Optional[Dict] = None
    ) -> List[Dict]:
        """Retrieve list of courses with caching and monitoring."""
        cache_key = f"courses_p{page}_s{page_size}_{hash(json.dumps(filters or {}))}"
        
        # Check cache
        if cache_key in self._response_cache:
            self._metrics.track_performance("cache_hit", 1)
            return self._response_cache[cache_key]
        
        params = {
            "page": page,
            "page_size": page_size,
            **(filters or {})
        }
        
        response = await self._make_request("GET", "courses", params=params)
        
        # Cache successful response
        self._response_cache[cache_key] = response["data"]
        return response["data"]

    async def get_course_content(self, course_id: str) -> Dict:
        """Retrieve detailed course content with monitoring."""
        cache_key = f"course_content_{course_id}"
        
        # Check cache
        if cache_key in self._response_cache:
            self._metrics.track_performance("cache_hit", 1)
            return self._response_cache[cache_key]
        
        response = await self._make_request("GET", f"courses/{course_id}/content")
        
        # Cache successful response
        self._response_cache[cache_key] = response["data"]
        return response["data"]

    async def health_check(self) -> Dict[str, Any]:
        """Perform comprehensive health check of Docebo integration."""
        try:
            start_time = datetime.now()
            
            # Test API connectivity
            await self._make_request("GET", "status")
            
            latency = (datetime.now() - start_time).total_seconds() * 1000
            
            return {
                "status": "healthy",
                "latency_ms": latency,
                "circuit_breaker": not self._circuit_breaker.is_open,
                "cache_size": len(self._response_cache),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

class DoceboContentManager:
    """Enhanced manager for optimized content synchronization between Docebo and knowledge base."""

    def __init__(
        self,
        client: DoceboClient,
        indexer: KnowledgeIndexer,
        config: Optional[Dict] = None
    ):
        """Initialize the enhanced content manager with monitoring and optimization."""
        self._client = client
        self._indexer = indexer
        self._logger = StructuredLogger("docebo_content_manager", {
            "service": "docebo",
            "component": "content_manager"
        })
        self._metrics = MetricsManager(
            namespace="AgentBuilderHub/DoceboContent",
            dimensions={"service": "content_sync"}
        )
        
        # Initialize sync status tracking
        self._sync_status = {
            "last_sync": None,
            "total_synced": 0,
            "failed_items": 0,
            "in_progress": False
        }

    async def sync_all_content(self, sync_options: Optional[Dict] = None) -> Dict[str, Any]:
        """Optimized synchronization of all available course content."""
        if self._sync_status["in_progress"]:
            return {"status": "in_progress", "message": "Sync already in progress"}
        
        self._sync_status["in_progress"] = True
        start_time = datetime.now()
        
        try:
            # Initialize sync metrics
            total_courses = 0
            processed_courses = 0
            failed_courses = 0
            
            # Retrieve all courses in batches
            page = 1
            while True:
                courses = await self._client.get_courses(
                    page=page,
                    page_size=BATCH_SIZE
                )
                
                if not courses:
                    break
                
                total_courses += len(courses)
                
                # Process courses in parallel batches
                tasks = []
                for course in courses:
                    task = self._process_course(course["id"])
                    tasks.append(task)
                
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Process results
                for result in results:
                    if isinstance(result, Exception):
                        failed_courses += 1
                        self._logger.log("error", f"Course sync failed: {str(result)}")
                    else:
                        processed_courses += 1
                
                page += 1
            
            # Update sync status
            sync_duration = (datetime.now() - start_time).total_seconds()
            self._sync_status.update({
                "last_sync": datetime.now().isoformat(),
                "total_synced": processed_courses,
                "failed_items": failed_courses,
                "in_progress": False
            })
            
            # Track metrics
            self._metrics.track_performance("sync_completed", 1, {
                "total_courses": total_courses,
                "processed_courses": processed_courses,
                "failed_courses": failed_courses,
                "duration_seconds": sync_duration
            })
            
            return {
                "status": "completed",
                "total_courses": total_courses,
                "processed_courses": processed_courses,
                "failed_courses": failed_courses,
                "duration_seconds": sync_duration,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            self._sync_status["in_progress"] = False
            self._logger.log("error", f"Content sync failed: {str(e)}")
            raise
        
    async def _process_course(self, course_id: str) -> Dict[str, Any]:
        """Process and index individual course content."""
        try:
            # Retrieve course content
            content = await self._client.get_course_content(course_id)
            
            # Prepare metadata
            metadata = {
                "source": "docebo",
                "course_id": course_id,
                "sync_timestamp": datetime.now().isoformat()
            }
            
            # Index content
            index_result = await self._indexer.index_content(
                content=json.dumps(content),
                metadata=metadata
            )
            
            return {
                "status": "success",
                "course_id": course_id,
                "index_result": index_result
            }
            
        except Exception as e:
            self._logger.log("error", f"Course processing failed: {str(e)}")
            raise

    async def get_sync_status(self) -> Dict[str, Any]:
        """Get detailed sync operation status."""
        return {
            **self._sync_status,
            "metrics": await self._metrics.get_metrics("sync_operation")
        }