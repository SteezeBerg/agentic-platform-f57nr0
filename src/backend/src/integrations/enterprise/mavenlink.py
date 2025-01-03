"""
Mavenlink integration module for Agent Builder Hub.
Provides secure access to project data, timelines, and resource allocations with enhanced features.
Version: 1.0.0
"""

import time
from datetime import datetime, timedelta
from typing import Dict, Optional, Any, List
from dataclasses import dataclass

# Third-party imports with versions
import requests  # ^2.31.0
from tenacity import retry, stop_after_attempt, wait_exponential  # ^8.2.0
from pydantic import BaseModel, Field, validator  # ^2.0.0
from circuitbreaker import circuit  # ^1.4.0
from cachetools import TTLCache, cached  # ^5.3.0

# Internal imports
from config.settings import get_settings
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Global constants
API_BASE_URL = "https://api.mavenlink.com/api/v1"
DEFAULT_TIMEOUT = 30
MAX_RETRIES = 3
CIRCUIT_BREAKER_THRESHOLD = 5
CACHE_TTL = 300  # 5 minutes

class MavenlinkProject(BaseModel):
    """Enhanced data model for Mavenlink project information."""
    id: str = Field(..., description="Project unique identifier")
    title: str = Field(..., description="Project title")
    status: str = Field(..., description="Current project status")
    start_date: datetime = Field(..., description="Project start date")
    end_date: datetime = Field(..., description="Project end date")
    custom_fields: Dict[str, Any] = Field(default_factory=dict, description="Custom project fields")
    resource_allocation: Dict[str, Any] = Field(default_factory=dict, description="Resource allocation data")
    timeline_metadata: Dict[str, Any] = Field(default_factory=dict, description="Timeline metadata")

    @validator('start_date', 'end_date', pre=True)
    def parse_datetime(cls, value):
        """Validate and parse datetime fields."""
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        return value

    def to_dict(self) -> Dict[str, Any]:
        """Convert project data to dictionary format."""
        return {
            **self.dict(),
            'start_date': self.start_date.isoformat(),
            'end_date': self.end_date.isoformat()
        }

class MavenlinkClient:
    """Enhanced client for Mavenlink API with advanced features."""

    def __init__(self, api_key: str, config: Optional[Dict[str, Any]] = None):
        """Initialize Mavenlink client with enhanced configuration."""
        self._api_key = api_key
        self._base_url = API_BASE_URL
        settings = get_settings()

        # Initialize session with connection pooling
        self._session = requests.Session()
        self._session.headers.update({
            'Authorization': f'Bearer {self._api_key}',
            'Content-Type': 'application/json',
            'User-Agent': f'AgentBuilderHub/{settings.config_version}'
        })

        # Initialize enhanced features
        self._logger = StructuredLogger("mavenlink_client", {
            'service': 'mavenlink',
            'version': settings.config_version
        })
        self._metrics = MetricsManager()
        self._cache = TTLCache(maxsize=100, ttl=CACHE_TTL)
        self._rate_limits = {
            'remaining': 1000,
            'reset_at': datetime.now()
        }

    @circuit(failure_threshold=CIRCUIT_BREAKER_THRESHOLD)
    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    @MetricsManager.track_performance
    async def get_project_timeline(
        self, 
        project_id: str, 
        resource_filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Retrieve enhanced project timeline with resource allocation data.
        
        Args:
            project_id: Unique project identifier
            resource_filters: Optional filters for resource data
            
        Returns:
            Dict containing comprehensive project timeline and resource data
        """
        cache_key = f"timeline_{project_id}_{hash(str(resource_filters))}"
        
        # Check cache first
        if cache_key in self._cache:
            self._logger.log("info", "Retrieved timeline from cache", {
                'project_id': project_id
            })
            return self._cache[cache_key]

        try:
            # Check rate limits
            self._check_rate_limits()

            # Build request URL with parameters
            url = f"{self._base_url}/projects/{project_id}/timeline"
            params = {
                'include': 'custom_field_values,assignments,resource_allocations',
                **(resource_filters or {})
            }

            # Make API request with timeout
            start_time = time.time()
            response = self._session.get(
                url,
                params=params,
                timeout=DEFAULT_TIMEOUT
            )
            response.raise_for_status()

            # Update rate limit tracking
            self._update_rate_limits(response.headers)

            # Parse and validate response
            timeline_data = response.json()
            project_data = self._extract_project_data(timeline_data)
            
            # Get additional resource data
            resource_data = await self._get_resource_allocations(project_id)
            
            # Merge timeline and resource data
            enhanced_data = self._merge_timeline_resource_data(
                project_data,
                resource_data
            )

            # Validate with Pydantic model
            project = MavenlinkProject(**enhanced_data)
            
            # Cache the validated data
            self._cache[cache_key] = project.to_dict()

            # Track performance metrics
            self._metrics.track_performance(
                'mavenlink_api_latency',
                time.time() - start_time,
                {'operation': 'get_timeline'}
            )

            return project.to_dict()

        except requests.exceptions.RequestException as e:
            self._logger.log("error", f"Mavenlink API request failed: {str(e)}", {
                'project_id': project_id,
                'error_type': type(e).__name__
            })
            raise

        except Exception as e:
            self._logger.log("error", f"Error processing timeline data: {str(e)}", {
                'project_id': project_id,
                'error_type': type(e).__name__
            })
            raise

    async def _get_resource_allocations(self, project_id: str) -> Dict[str, Any]:
        """Retrieve detailed resource allocation data."""
        url = f"{self._base_url}/projects/{project_id}/resource_allocations"
        
        response = self._session.get(
            url,
            timeout=DEFAULT_TIMEOUT
        )
        response.raise_for_status()
        
        return response.json().get('resource_allocations', {})

    def _merge_timeline_resource_data(
        self,
        timeline_data: Dict[str, Any],
        resource_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Merge timeline and resource allocation data."""
        return {
            **timeline_data,
            'resource_allocation': resource_data,
            'timeline_metadata': {
                'last_updated': datetime.now().isoformat(),
                'data_sources': ['timeline', 'resource_allocations']
            }
        }

    def _extract_project_data(self, response_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract and validate project data from API response."""
        project_data = response_data.get('projects', {}).get('data', {})
        if not project_data:
            raise ValueError("Invalid project data in API response")
        return project_data

    def _check_rate_limits(self) -> None:
        """Check and handle API rate limits."""
        if self._rate_limits['remaining'] <= 0:
            wait_time = (self._rate_limits['reset_at'] - datetime.now()).total_seconds()
            if wait_time > 0:
                time.sleep(wait_time)

    def _update_rate_limits(self, headers: Dict[str, str]) -> None:
        """Update rate limit tracking from response headers."""
        self._rate_limits.update({
            'remaining': int(headers.get('X-RateLimit-Remaining', 1000)),
            'reset_at': datetime.fromtimestamp(
                int(headers.get('X-RateLimit-Reset', time.time() + 3600))
            )
        })

__all__ = ['MavenlinkClient', 'MavenlinkProject']