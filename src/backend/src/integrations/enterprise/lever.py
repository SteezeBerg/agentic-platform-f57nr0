"""
Lever ATS (Applicant Tracking System) integration module for Agent Builder Hub.
Provides secure access to recruitment data with comprehensive monitoring and error handling.
Version: 1.0.0
"""

# Third-party imports with versions
import requests  # ^2.31.0
from tenacity import (  # ^8.2.0
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from pydantic import BaseModel, Field  # ^2.0.0
from typing import Dict, List, Optional, Any, Union
from datetime import datetime, timedelta

# Internal imports
from config.settings import get_settings, Settings
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Global constants
API_VERSION = "v1"
BASE_URL = "https://api.lever.co"
RETRY_CONFIG = {
    "max_attempts": 3,
    "wait_exponential_multiplier": 1000,
    "retry_on_exceptions": (requests.exceptions.RequestException,),
    "retry_on_status": [429, 500, 502, 503, 504]
}
RATE_LIMIT_CONFIG = {
    "max_requests": 100,
    "time_window": 60
}

class CandidateModel(BaseModel):
    """Data model for Lever candidate information"""
    id: str
    name: str
    email: Optional[str]
    phone: Optional[str]
    created_at: datetime
    updated_at: datetime
    stage: Optional[str]
    tags: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    archived: bool = False
    custom_fields: Dict[str, Any] = Field(default_factory=dict)

class JobPostingModel(BaseModel):
    """Data model for Lever job posting information"""
    id: str
    title: str
    description: str
    state: str
    created_at: datetime
    updated_at: datetime
    categories: Dict[str, str] = Field(default_factory=dict)
    team: Optional[str]
    location: Optional[str]
    commitment: Optional[str]
    custom_fields: Dict[str, Any] = Field(default_factory=dict)

class LeverClient:
    """Enhanced client for interacting with Lever ATS API with comprehensive monitoring"""

    def __init__(self, api_key: str, config: Optional[Dict] = None):
        """Initialize Lever API client with security and monitoring capabilities"""
        self._settings = get_settings()
        self._api_key = api_key
        self._base_url = f"{BASE_URL}/{API_VERSION}"
        
        # Initialize structured logging
        self._logger = StructuredLogger("lever_integration", {
            "service": "lever",
            "version": API_VERSION
        })
        
        # Initialize metrics tracking
        self._metrics = MetricsManager(
            namespace="AgentBuilderHub/Lever",
            dimensions={"service": "lever", "version": API_VERSION}
        )
        
        # Configure rate limiting
        self._rate_limiter = {
            "requests": [],
            "max_requests": config.get("max_requests", RATE_LIMIT_CONFIG["max_requests"]),
            "time_window": config.get("time_window", RATE_LIMIT_CONFIG["time_window"])
        }
        
        # Validate credentials and connectivity
        self._validate_connection()

    def _validate_connection(self) -> None:
        """Validate API credentials and connectivity"""
        try:
            response = requests.get(
                f"{self._base_url}/opportunities",
                headers=self._get_headers(),
                params={"limit": 1},
                timeout=10
            )
            response.raise_for_status()
            self._logger.log("info", "Successfully validated Lever API connection")
        except Exception as e:
            self._logger.log("error", f"Failed to validate Lever API connection: {str(e)}")
            self._metrics.track_performance("connection_error", 1)
            raise

    def _get_headers(self) -> Dict[str, str]:
        """Get authenticated request headers"""
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    def _check_rate_limit(self) -> None:
        """Check and enforce rate limiting"""
        current_time = datetime.now()
        self._rate_limiter["requests"] = [
            req_time for req_time in self._rate_limiter["requests"]
            if (current_time - req_time).total_seconds() < self._rate_limiter["time_window"]
        ]
        
        if len(self._rate_limiter["requests"]) >= self._rate_limiter["max_requests"]:
            raise Exception("Rate limit exceeded")
        
        self._rate_limiter["requests"].append(current_time)

    @retry(
        stop=stop_after_attempt(RETRY_CONFIG["max_attempts"]),
        wait=wait_exponential(multiplier=RETRY_CONFIG["wait_exponential_multiplier"]),
        retry=retry_if_exception_type(RETRY_CONFIG["retry_on_exceptions"])
    )
    async def get_candidates(
        self,
        filters: Optional[Dict] = None,
        include_archived: bool = False,
        page_size: int = 100
    ) -> List[CandidateModel]:
        """Retrieve candidate information with enhanced error handling and monitoring"""
        try:
            self._check_rate_limit()
            
            params = {
                "limit": page_size,
                "archived": str(include_archived).lower(),
                **(filters or {})
            }
            
            with self._metrics.track_performance("api_request", extra_dimensions={"endpoint": "candidates"}):
                response = requests.get(
                    f"{self._base_url}/candidates",
                    headers=self._get_headers(),
                    params=params,
                    timeout=30
                )
                response.raise_for_status()
            
            candidates_data = response.json()["data"]
            return [CandidateModel(**candidate) for candidate in candidates_data]
            
        except Exception as e:
            self._logger.log("error", f"Error fetching candidates: {str(e)}")
            self._metrics.track_performance("candidate_fetch_error", 1)
            raise

    @retry(
        stop=stop_after_attempt(RETRY_CONFIG["max_attempts"]),
        wait=wait_exponential(multiplier=RETRY_CONFIG["wait_exponential_multiplier"]),
        retry=retry_if_exception_type(RETRY_CONFIG["retry_on_exceptions"])
    )
    async def get_job_postings(
        self,
        filters: Optional[Dict] = None,
        active_only: bool = True,
        page_size: int = 100
    ) -> List[JobPostingModel]:
        """Retrieve job posting information with comprehensive error handling"""
        try:
            self._check_rate_limit()
            
            params = {
                "limit": page_size,
                "state": "published" if active_only else None,
                **(filters or {})
            }
            
            with self._metrics.track_performance("api_request", extra_dimensions={"endpoint": "postings"}):
                response = requests.get(
                    f"{self._base_url}/postings",
                    headers=self._get_headers(),
                    params={k: v for k, v in params.items() if v is not None},
                    timeout=30
                )
                response.raise_for_status()
            
            postings_data = response.json()["data"]
            return [JobPostingModel(**posting) for posting in postings_data]
            
        except Exception as e:
            self._logger.log("error", f"Error fetching job postings: {str(e)}")
            self._metrics.track_performance("posting_fetch_error", 1)
            raise

    async def sync_data(self, sync_options: Optional[Dict] = None) -> Dict[str, Any]:
        """Synchronize Lever data with enhanced monitoring and validation"""
        try:
            sync_start = datetime.now()
            sync_metrics = {
                "candidates_synced": 0,
                "postings_synced": 0,
                "errors": 0,
                "start_time": sync_start
            }
            
            # Sync candidates
            try:
                candidates = await self.get_candidates(
                    filters=sync_options.get("candidate_filters"),
                    include_archived=sync_options.get("include_archived", False)
                )
                sync_metrics["candidates_synced"] = len(candidates)
            except Exception as e:
                self._logger.log("error", f"Error syncing candidates: {str(e)}")
                sync_metrics["errors"] += 1
            
            # Sync job postings
            try:
                postings = await self.get_job_postings(
                    filters=sync_options.get("posting_filters"),
                    active_only=sync_options.get("active_only", True)
                )
                sync_metrics["postings_synced"] = len(postings)
            except Exception as e:
                self._logger.log("error", f"Error syncing job postings: {str(e)}")
                sync_metrics["errors"] += 1
            
            # Calculate sync duration and metrics
            sync_metrics["duration"] = (datetime.now() - sync_start).total_seconds()
            sync_metrics["success"] = sync_metrics["errors"] == 0
            
            # Track sync performance
            self._metrics.track_performance(
                "data_sync",
                sync_metrics["duration"],
                extra_dimensions={"success": str(sync_metrics["success"])}
            )
            
            return sync_metrics
            
        except Exception as e:
            self._logger.log("error", f"Error during data sync: {str(e)}")
            self._metrics.track_performance("sync_error", 1)
            raise