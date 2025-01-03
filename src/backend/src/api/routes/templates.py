"""
FastAPI router implementation for agent template management endpoints.
Provides secure REST API routes for CRUD operations on agent templates.
Version: 1.0.0
"""

from typing import Dict, List, Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi_limiter import RateLimiter
import prometheus_client

from services.template_service import TemplateService
from schemas.template import (
    TemplateBase, TemplateCreate, TemplateUpdate, TemplateResponse, TemplateList
)
from api.dependencies import get_current_user, verify_admin_access
from utils.logging import audit_log

# Initialize router with prefix and tags
router = APIRouter(prefix='/templates', tags=['templates'])

# Global constants
DEFAULT_PAGE_SIZE = 20
DEFAULT_PAGE = 1
MAX_PAGE_SIZE = 100
RATE_LIMIT_CALLS = 100
RATE_LIMIT_PERIOD = 3600

# Initialize metrics
TEMPLATE_METRICS = {
    'requests': prometheus_client.Counter(
        'template_requests_total',
        'Total number of template requests',
        ['operation', 'status']
    ),
    'latency': prometheus_client.Histogram(
        'template_operation_latency_seconds',
        'Template operation latency'
    )
}

@router.get('/', response_model=TemplateList)
@Depends(get_current_user)
@prometheus_client.monitor()
@RateLimiter(calls=RATE_LIMIT_CALLS, period=RATE_LIMIT_PERIOD)
async def get_templates(
    category: Optional[str] = None,
    deployment_type: Optional[str] = None,
    page: int = Query(DEFAULT_PAGE, ge=1),
    size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    sort_by: Optional[str] = None,
    include_deprecated: Optional[bool] = False,
    template_service: TemplateService = Depends()
) -> TemplateList:
    """
    List agent templates with pagination, filtering, and caching.
    
    Args:
        category: Optional category filter
        deployment_type: Optional deployment type filter
        page: Page number (1-based)
        size: Page size
        sort_by: Optional sort field
        include_deprecated: Whether to include deprecated templates
        template_service: Template service instance
        
    Returns:
        TemplateList containing paginated results
    """
    try:
        TEMPLATE_METRICS['requests'].labels(operation='list', status='started').inc()
        
        templates, total = await template_service.list_templates(
            page=page,
            size=size,
            category=category,
            sort_by=sort_by,
            include_archived=include_deprecated
        )
        
        TEMPLATE_METRICS['requests'].labels(operation='list', status='success').inc()
        return templates

    except Exception as e:
        TEMPLATE_METRICS['requests'].labels(operation='list', status='error').inc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get('/{template_id}', response_model=TemplateResponse)
@Depends(get_current_user)
@prometheus_client.monitor()
@RateLimiter(calls=RATE_LIMIT_CALLS, period=RATE_LIMIT_PERIOD)
async def get_template_by_id(
    template_id: UUID,
    template_service: TemplateService = Depends()
) -> TemplateResponse:
    """
    Get template details by ID with caching.
    
    Args:
        template_id: Template UUID
        template_service: Template service instance
        
    Returns:
        Template details if found
    """
    try:
        TEMPLATE_METRICS['requests'].labels(operation='get', status='started').inc()
        
        template = await template_service.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
            
        TEMPLATE_METRICS['requests'].labels(operation='get', status='success').inc()
        return template

    except HTTPException:
        raise
    except Exception as e:
        TEMPLATE_METRICS['requests'].labels(operation='get', status='error').inc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post('/', response_model=TemplateResponse, status_code=201)
@Depends(verify_admin_access)
@prometheus_client.monitor()
@RateLimiter(calls=RATE_LIMIT_CALLS, period=RATE_LIMIT_PERIOD)
async def create_template(
    template: TemplateCreate,
    background_tasks: BackgroundTasks,
    template_service: TemplateService = Depends(),
    current_user: Dict = Depends(get_current_user)
) -> TemplateResponse:
    """
    Create new template with validation and audit logging.
    
    Args:
        template: Template creation data
        background_tasks: Background task manager
        template_service: Template service instance
        current_user: Current authenticated user
        
    Returns:
        Created template details
    """
    try:
        TEMPLATE_METRICS['requests'].labels(operation='create', status='started').inc()
        
        created_template = await template_service.create_template(template)
        
        # Add audit logging task
        background_tasks.add_task(
            audit_log,
            "template_created",
            {"template_id": str(created_template.id), "user_id": current_user["id"]}
        )
        
        TEMPLATE_METRICS['requests'].labels(operation='create', status='success').inc()
        return created_template

    except Exception as e:
        TEMPLATE_METRICS['requests'].labels(operation='create', status='error').inc()
        raise HTTPException(status_code=500, detail=str(e))

@router.put('/{template_id}', response_model=TemplateResponse)
@Depends(verify_admin_access)
@prometheus_client.monitor()
@RateLimiter(calls=RATE_LIMIT_CALLS, period=RATE_LIMIT_PERIOD)
async def update_template(
    template_id: UUID,
    template: TemplateUpdate,
    background_tasks: BackgroundTasks,
    template_service: TemplateService = Depends(),
    current_user: Dict = Depends(get_current_user)
) -> TemplateResponse:
    """
    Update existing template with validation.
    
    Args:
        template_id: Template UUID to update
        template: Template update data
        background_tasks: Background task manager
        template_service: Template service instance
        current_user: Current authenticated user
        
    Returns:
        Updated template details
    """
    try:
        TEMPLATE_METRICS['requests'].labels(operation='update', status='started').inc()
        
        updated_template = await template_service.update_template(template_id, template)
        if not updated_template:
            raise HTTPException(status_code=404, detail="Template not found")
            
        # Add audit logging task
        background_tasks.add_task(
            audit_log,
            "template_updated",
            {
                "template_id": str(template_id),
                "user_id": current_user["id"],
                "changes": template.dict(exclude_unset=True)
            }
        )
        
        TEMPLATE_METRICS['requests'].labels(operation='update', status='success').inc()
        return updated_template

    except HTTPException:
        raise
    except Exception as e:
        TEMPLATE_METRICS['requests'].labels(operation='update', status='error').inc()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete('/{template_id}', status_code=204)
@Depends(verify_admin_access)
@prometheus_client.monitor()
@RateLimiter(calls=RATE_LIMIT_CALLS, period=RATE_LIMIT_PERIOD)
async def delete_template(
    template_id: UUID,
    background_tasks: BackgroundTasks,
    template_service: TemplateService = Depends(),
    current_user: Dict = Depends(get_current_user)
) -> None:
    """
    Delete template with dependency checks.
    
    Args:
        template_id: Template UUID to delete
        background_tasks: Background task manager
        template_service: Template service instance
        current_user: Current authenticated user
    """
    try:
        TEMPLATE_METRICS['requests'].labels(operation='delete', status='started').inc()
        
        success = await template_service.delete_template(template_id)
        if not success:
            raise HTTPException(status_code=404, detail="Template not found")
            
        # Add audit logging task
        background_tasks.add_task(
            audit_log,
            "template_deleted",
            {"template_id": str(template_id), "user_id": current_user["id"]}
        )
        
        TEMPLATE_METRICS['requests'].labels(operation='delete', status='success').inc()

    except HTTPException:
        raise
    except Exception as e:
        TEMPLATE_METRICS['requests'].labels(operation='delete', status='error').inc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post('/{template_id}/validate', status_code=200)
@Depends(get_current_user)
@prometheus_client.monitor()
@RateLimiter(calls=RATE_LIMIT_CALLS, period=RATE_LIMIT_PERIOD)
async def validate_config(
    template_id: UUID,
    config: Dict[str, Any],
    deployment_type: str,
    template_service: TemplateService = Depends()
) -> Dict[str, Any]:
    """
    Validate template configuration for deployment.
    
    Args:
        template_id: Template UUID
        config: Configuration to validate
        deployment_type: Type of deployment
        template_service: Template service instance
        
    Returns:
        Validation result with any error messages
    """
    try:
        TEMPLATE_METRICS['requests'].labels(operation='validate', status='started').inc()
        
        is_valid, error = await template_service.validate_template_config(
            template_id,
            config,
            deployment_type
        )
        
        TEMPLATE_METRICS['requests'].labels(operation='validate', status='success').inc()
        
        return {
            "valid": is_valid,
            "error": error,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        TEMPLATE_METRICS['requests'].labels(operation='validate', status='error').inc()
        raise HTTPException(status_code=500, detail=str(e))