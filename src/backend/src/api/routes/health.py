"""
Health check router module for Agent Builder Hub.
Provides comprehensive system health monitoring endpoints with enhanced observability.
Version: 1.0.0
"""

from datetime import datetime, timedelta
from typing import Dict, Optional
from fastapi import APIRouter, Depends, HTTPException
from cachetools import TTLCache

# Internal imports
from services.metrics_service import MetricsService
from utils.metrics import track_time

# Initialize router with prefix and tags
router = APIRouter(prefix='/health', tags=['Health'])

# Initialize services
metrics_service = MetricsService()

# Cache for basic health check responses (30 second TTL)
health_cache = TTLCache(maxsize=100, ttl=30)

@router.get('/')
@track_time('health_check')
async def get_health() -> Dict:
    """
    Basic health check endpoint with caching support.
    Returns system availability status and basic metrics.
    """
    cache_key = 'basic_health'
    
    # Check cache first
    if cache_key in health_cache:
        return health_cache[cache_key]
    
    try:
        # Get current timestamp
        current_time = datetime.utcnow()
        
        # Get basic system metrics
        system_metrics = await metrics_service.get_system_metrics()
        
        # Validate response time SLA
        sla_validation = await metrics_service.validate_sla('api_latency')
        
        # Prepare response
        health_status = {
            'status': 'healthy',
            'timestamp': current_time.isoformat(),
            'version': '1.0.0',
            'environment': 'production',
            'response_time': system_metrics.get('api_latency', 0),
            'sla_compliant': sla_validation.get('compliant', True),
            'cache_status': 'miss'
        }
        
        # Cache the response
        health_cache[cache_key] = health_status
        
        return health_status
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Health check failed: {str(e)}"
        )

@router.get('/detailed')
@track_time('detailed_health_check')
async def get_detailed_health(time_window: int = 300) -> Dict:
    """
    Detailed health check with comprehensive metrics and trend analysis.
    
    Args:
        time_window: Time window in seconds for trend analysis (default: 5 minutes)
    """
    try:
        # Validate time window
        if time_window < 60 or time_window > 3600:
            raise HTTPException(
                status_code=400,
                detail="Time window must be between 60 and 3600 seconds"
            )
        
        # Get system metrics for specified window
        system_metrics = await metrics_service.get_system_metrics(
            start_time=datetime.utcnow() - timedelta(seconds=time_window)
        )
        
        # Get component health status
        component_status = await metrics_service.get_component_metrics()
        
        # Calculate performance trends
        performance_trends = {
            'cpu_usage': system_metrics.get('cpu_trend'),
            'memory_usage': system_metrics.get('memory_trend'),
            'api_latency': system_metrics.get('latency_trend'),
            'error_rate': system_metrics.get('error_trend')
        }
        
        # Validate against SLAs
        sla_status = await metrics_service.validate_sla('system_health')
        
        return {
            'status': 'healthy' if all(component_status.values()) else 'degraded',
            'timestamp': datetime.utcnow().isoformat(),
            'metrics': {
                'cpu_usage': system_metrics.get('cpu_usage'),
                'memory_usage': system_metrics.get('memory_usage'),
                'api_latency': system_metrics.get('api_latency'),
                'error_rate': system_metrics.get('error_rate')
            },
            'components': component_status,
            'trends': performance_trends,
            'sla_status': sla_status,
            'analysis_window': f"{time_window} seconds"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Detailed health check failed: {str(e)}"
        )

@router.get('/components/{component_name}')
@track_time('component_health_check')
async def get_component_health(
    component_name: str,
    include_dependencies: bool = False
) -> Dict:
    """
    Get detailed health status for a specific system component.
    
    Args:
        component_name: Name of the component to check
        include_dependencies: Include dependency health analysis
    """
    try:
        # Get component metrics
        component_metrics = await metrics_service.get_component_metrics(
            component_name=component_name
        )
        
        if not component_metrics:
            raise HTTPException(
                status_code=404,
                detail=f"Component not found: {component_name}"
            )
            
        # Get component health status
        health_status = component_metrics.get('health_status', False)
        
        # Analyze dependencies if requested
        dependency_health = {}
        if include_dependencies and component_metrics.get('dependencies'):
            for dep in component_metrics['dependencies']:
                dep_metrics = await metrics_service.get_component_metrics(
                    component_name=dep
                )
                dependency_health[dep] = dep_metrics.get('health_status', False)
        
        # Validate against component SLA
        sla_status = await metrics_service.validate_sla(
            f'component_{component_name}'
        )
        
        return {
            'component': component_name,
            'status': 'healthy' if health_status else 'unhealthy',
            'timestamp': datetime.utcnow().isoformat(),
            'metrics': {
                'response_time': component_metrics.get('response_time'),
                'error_rate': component_metrics.get('error_rate'),
                'throughput': component_metrics.get('throughput')
            },
            'dependencies': dependency_health if include_dependencies else None,
            'sla_status': sla_status,
            'last_error': component_metrics.get('last_error'),
            'uptime': component_metrics.get('uptime')
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Component health check failed: {str(e)}"
        )