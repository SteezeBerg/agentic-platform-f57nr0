"""
FastAPI route handlers for system-wide and agent-specific metrics with enhanced security,
validation, and monitoring capabilities.
Version: 1.0.0
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from cachetools import TTLCache

from services.metrics_service import MetricsService
from schemas.metrics import (
    AgentMetricsSchema,
    SystemMetricsSchema,
    MetricResponse,
    MetricAggregation
)
from api.dependencies import verify_admin_access, verify_agent_access, RateLimiter
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Initialize router with prefix and tags
router = APIRouter(prefix="/metrics", tags=["metrics"])

# Initialize services and utilities
metrics_service = MetricsService()
rate_limiter = RateLimiter(max_requests=100, window_seconds=60)
logger = StructuredLogger("metrics_routes", {"service": "agent_builder"})
metrics = MetricsManager(namespace="AgentBuilderHub/MetricsAPI")

# Initialize response cache
response_cache = TTLCache(maxsize=1000, ttl=300)  # 5 minutes TTL

@router.post("/agents/{agent_id}")
async def record_agent_metrics(
    agent_id: UUID,
    metrics_data: AgentMetricsSchema,
    background_tasks: BackgroundTasks,
    current_user: Dict = Depends(verify_agent_access),
    rate_limit: bool = Depends(rate_limiter)
) -> Dict:
    """
    Record performance metrics for a specific agent with enhanced validation and async processing.
    """
    try:
        # Track API call
        metrics.track_performance("record_agent_metrics_called", 1)
        start_time = datetime.utcnow()

        # Validate agent access
        if not await verify_agent_access(agent_id, current_user):
            raise HTTPException(status_code=403, detail="Insufficient permissions")

        # Generate tracking ID for metric submission
        tracking_id = str(UUID())

        # Add metric recording to background tasks
        background_tasks.add_task(
            metrics_service.record_agent_metrics,
            metrics_data,
            agent_id=agent_id,
            tracking_id=tracking_id
        )

        # Track successful submission
        duration = (datetime.utcnow() - start_time).total_seconds()
        metrics.track_performance("record_agent_metrics_success", 1, {
            "duration": duration,
            "agent_id": str(agent_id)
        })

        return {
            "status": "success",
            "message": "Metrics recording scheduled",
            "tracking_id": tracking_id,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        # Log error and track failure
        logger.log("error", f"Failed to record agent metrics: {str(e)}")
        metrics.track_performance("record_agent_metrics_error", 1)
        raise HTTPException(status_code=500, detail="Failed to record metrics")

@router.post("/system")
async def record_system_metrics(
    metrics_data: SystemMetricsSchema,
    background_tasks: BackgroundTasks,
    current_user: Dict = Depends(verify_admin_access),
    rate_limit: bool = Depends(rate_limiter)
) -> Dict:
    """
    Record system-wide performance metrics with admin access control.
    """
    try:
        # Track API call
        metrics.track_performance("record_system_metrics_called", 1)
        start_time = datetime.utcnow()

        # Generate tracking ID
        tracking_id = str(UUID())

        # Add to background tasks
        background_tasks.add_task(
            metrics_service.record_system_metrics,
            metrics_data,
            tracking_id=tracking_id
        )

        # Track successful submission
        duration = (datetime.utcnow() - start_time).total_seconds()
        metrics.track_performance("record_system_metrics_success", 1, {
            "duration": duration
        })

        return {
            "status": "success",
            "message": "System metrics recording scheduled",
            "tracking_id": tracking_id,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.log("error", f"Failed to record system metrics: {str(e)}")
        metrics.track_performance("record_system_metrics_error", 1)
        raise HTTPException(status_code=500, detail="Failed to record metrics")

@router.get("/agents/{agent_id}")
async def get_agent_metrics(
    agent_id: UUID,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    aggregation_type: Optional[str] = None,
    period: Optional[int] = None,
    current_user: Dict = Depends(verify_agent_access),
    rate_limit: bool = Depends(rate_limiter)
) -> Union[List[MetricResponse], MetricAggregation]:
    """
    Retrieve metrics for a specific agent with caching and aggregation support.
    """
    try:
        # Track API call
        metrics.track_performance("get_agent_metrics_called", 1)
        start_process_time = datetime.utcnow()

        # Set default time range if not provided
        end_time = end_time or datetime.utcnow()
        start_time = start_time or (end_time - timedelta(hours=24))

        # Validate time range
        if start_time >= end_time:
            raise HTTPException(status_code=400, detail="Invalid time range")

        # Generate cache key
        cache_key = f"agent_metrics:{agent_id}:{start_time}:{end_time}:{aggregation_type}:{period}"

        # Check cache
        if cache_key in response_cache:
            metrics.track_performance("get_agent_metrics_cache_hit", 1)
            return response_cache[cache_key]

        # Retrieve metrics
        result = await metrics_service.get_agent_metrics(
            agent_id=agent_id,
            start_time=start_time,
            end_time=end_time,
            aggregation_type=aggregation_type,
            period=period
        )

        # Cache response
        response_cache[cache_key] = result

        # Track successful retrieval
        duration = (datetime.utcnow() - start_process_time).total_seconds()
        metrics.track_performance("get_agent_metrics_success", 1, {
            "duration": duration,
            "agent_id": str(agent_id)
        })

        return result

    except Exception as e:
        logger.log("error", f"Failed to retrieve agent metrics: {str(e)}")
        metrics.track_performance("get_agent_metrics_error", 1)
        raise HTTPException(status_code=500, detail="Failed to retrieve metrics")

@router.get("/system")
async def get_system_metrics(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    aggregation_type: Optional[str] = None,
    period: Optional[int] = None,
    current_user: Dict = Depends(verify_admin_access),
    rate_limit: bool = Depends(rate_limiter)
) -> Union[List[MetricResponse], MetricAggregation]:
    """
    Retrieve system-wide metrics with admin access control and caching.
    """
    try:
        # Track API call
        metrics.track_performance("get_system_metrics_called", 1)
        start_process_time = datetime.utcnow()

        # Set default time range
        end_time = end_time or datetime.utcnow()
        start_time = start_time or (end_time - timedelta(hours=24))

        # Validate time range
        if start_time >= end_time:
            raise HTTPException(status_code=400, detail="Invalid time range")

        # Generate cache key
        cache_key = f"system_metrics:{start_time}:{end_time}:{aggregation_type}:{period}"

        # Check cache
        if cache_key in response_cache:
            metrics.track_performance("get_system_metrics_cache_hit", 1)
            return response_cache[cache_key]

        # Retrieve metrics
        result = await metrics_service.get_system_metrics(
            start_time=start_time,
            end_time=end_time,
            aggregation_type=aggregation_type,
            period=period
        )

        # Cache response
        response_cache[cache_key] = result

        # Track successful retrieval
        duration = (datetime.utcnow() - start_process_time).total_seconds()
        metrics.track_performance("get_system_metrics_success", 1, {
            "duration": duration
        })

        return result

    except Exception as e:
        logger.log("error", f"Failed to retrieve system metrics: {str(e)}")
        metrics.track_performance("get_system_metrics_error", 1)
        raise HTTPException(status_code=500, detail="Failed to retrieve metrics")