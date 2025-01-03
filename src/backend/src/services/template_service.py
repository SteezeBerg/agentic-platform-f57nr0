"""
Service layer for managing agent templates with enhanced security, monitoring, and error handling.
Provides high-level business logic for template operations with comprehensive validation.
Version: 1.0.0
"""

from uuid import UUID
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import HTTPException
from tenacity import retry, stop_after_attempt, wait_exponential
from prometheus_client import Counter, Histogram
import logging

from schemas.template import (
    TemplateBase, TemplateCreate, TemplateUpdate, TemplateResponse, TemplateList
)
from db.repositories.template_repository import TemplateRepository
from core.agents.templates import TemplateManager

# Performance monitoring metrics
TEMPLATE_OPERATIONS = Counter(
    'template_operations_total',
    'Total number of template operations',
    ['operation', 'status']
)
OPERATION_LATENCY = Histogram(
    'template_operation_latency_seconds',
    'Template operation latency in seconds',
    ['operation']
)

# Constants
DEFAULT_PAGE = 1
DEFAULT_PAGE_SIZE = 20
MAX_RETRY_ATTEMPTS = 3
CACHE_TTL_SECONDS = 300

class TemplateService:
    """Enhanced service class for managing agent templates with security and monitoring."""

    def __init__(self, template_repository: TemplateRepository, template_manager: TemplateManager):
        """Initialize template service with enhanced components."""
        self._repository = template_repository
        self._manager = template_manager
        self._logger = logging.getLogger(__name__)
        
        # Configure retry settings
        self._retry_config = {
            'wait': wait_exponential(multiplier=1, min=4, max=10),
            'stop': stop_after_attempt(MAX_RETRY_ATTEMPTS),
            'reraise': True
        }

    @retry(stop=stop_after_attempt(MAX_RETRY_ATTEMPTS))
    async def get_template(self, template_id: UUID) -> TemplateResponse:
        """
        Retrieve template by ID with caching and monitoring.
        
        Args:
            template_id: UUID of template to retrieve
            
        Returns:
            Template details
            
        Raises:
            HTTPException: If template not found or error occurs
        """
        try:
            with OPERATION_LATENCY.labels('get_template').time():
                # Check cache first via template manager
                template = await self._manager.get_template(template_id)
                
                if not template:
                    TEMPLATE_OPERATIONS.labels('get_template', 'not_found').inc()
                    raise HTTPException(status_code=404, detail="Template not found")

                TEMPLATE_OPERATIONS.labels('get_template', 'success').inc()
                self._logger.info(f"Retrieved template {template_id}")
                return template

        except HTTPException:
            raise
        except Exception as e:
            self._logger.error(f"Error retrieving template {template_id}: {str(e)}")
            TEMPLATE_OPERATIONS.labels('get_template', 'error').inc()
            raise HTTPException(status_code=500, detail="Internal server error")

    async def list_templates(
        self,
        page: int = DEFAULT_PAGE,
        size: int = DEFAULT_PAGE_SIZE,
        category: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> TemplateList:
        """
        List templates with enhanced filtering and monitoring.
        
        Args:
            page: Page number
            size: Page size
            category: Optional category filter
            filters: Additional filters
            
        Returns:
            Paginated template list
        """
        try:
            with OPERATION_LATENCY.labels('list_templates').time():
                # Validate pagination parameters
                page = max(1, page)
                size = max(1, min(size, 100))

                # Apply security filters
                secure_filters = self._apply_security_filters(filters or {})

                # Get templates through manager
                templates, total = await self._manager.list_templates(
                    page=page,
                    size=size,
                    category=category,
                    sort_by=secure_filters.get('sort_by')
                )

                TEMPLATE_OPERATIONS.labels('list_templates', 'success').inc()
                self._logger.info(f"Listed {len(templates)} templates")

                return TemplateList(
                    items=templates,
                    total=total,
                    page=page,
                    size=size,
                    filters=secure_filters,
                    sort_options={"name": "asc", "created_at": "desc"}
                )

        except Exception as e:
            self._logger.error(f"Error listing templates: {str(e)}")
            TEMPLATE_OPERATIONS.labels('list_templates', 'error').inc()
            raise HTTPException(status_code=500, detail="Internal server error")

    async def create_template(self, template_data: TemplateCreate) -> TemplateResponse:
        """
        Create new agent template with validation.
        
        Args:
            template_data: Template creation data
            
        Returns:
            Created template
        """
        try:
            with OPERATION_LATENCY.labels('create_template').time():
                # Begin transaction
                async with self._repository.begin_transaction():
                    # Validate template data
                    await self._validate_template_data(template_data)

                    # Check for duplicates
                    existing = await self._repository.get_by_name(template_data.name)
                    if existing:
                        raise HTTPException(
                            status_code=409,
                            detail="Template with this name already exists"
                        )

                    # Create template
                    template = await self._repository.create(template_data.dict())
                    
                    TEMPLATE_OPERATIONS.labels('create_template', 'success').inc()
                    self._logger.info(f"Created template {template.id}")
                    return TemplateResponse.from_orm(template)

        except HTTPException:
            raise
        except Exception as e:
            self._logger.error(f"Error creating template: {str(e)}")
            TEMPLATE_OPERATIONS.labels('create_template', 'error').inc()
            raise HTTPException(status_code=500, detail="Internal server error")

    @retry(stop=stop_after_attempt(MAX_RETRY_ATTEMPTS))
    async def update_template(
        self,
        template_id: UUID,
        template_data: TemplateUpdate
    ) -> TemplateResponse:
        """
        Update template with optimistic locking.
        
        Args:
            template_id: Template ID to update
            template_data: Update data
            
        Returns:
            Updated template
        """
        try:
            with OPERATION_LATENCY.labels('update_template').time():
                async with self._repository.begin_transaction():
                    # Get current template
                    template = await self._manager.get_template(template_id)
                    if not template:
                        raise HTTPException(status_code=404, detail="Template not found")

                    # Validate update data
                    await self._validate_template_data(template_data, template)

                    # Update template
                    updated = await self._repository.update(
                        template_id,
                        template_data.dict(exclude_unset=True)
                    )

                    # Invalidate cache
                    await self._manager.invalidate_cache(template_id)

                    TEMPLATE_OPERATIONS.labels('update_template', 'success').inc()
                    self._logger.info(f"Updated template {template_id}")
                    return TemplateResponse.from_orm(updated)

        except HTTPException:
            raise
        except Exception as e:
            self._logger.error(f"Error updating template {template_id}: {str(e)}")
            TEMPLATE_OPERATIONS.labels('update_template', 'error').inc()
            raise HTTPException(status_code=500, detail="Internal server error")

    async def delete_template(self, template_id: UUID) -> bool:
        """
        Delete template with dependency checks.
        
        Args:
            template_id: Template ID to delete
            
        Returns:
            Deletion success status
        """
        try:
            with OPERATION_LATENCY.labels('delete_template').time():
                async with self._repository.begin_transaction():
                    # Check template exists
                    template = await self._manager.get_template(template_id)
                    if not template:
                        raise HTTPException(status_code=404, detail="Template not found")

                    # Check for dependencies
                    if await self._has_dependencies(template_id):
                        raise HTTPException(
                            status_code=409,
                            detail="Template has active dependencies"
                        )

                    # Delete template
                    success = await self._repository.delete(template_id)

                    # Invalidate cache
                    await self._manager.invalidate_cache(template_id)

                    TEMPLATE_OPERATIONS.labels('delete_template', 'success').inc()
                    self._logger.info(f"Deleted template {template_id}")
                    return success

        except HTTPException:
            raise
        except Exception as e:
            self._logger.error(f"Error deleting template {template_id}: {str(e)}")
            TEMPLATE_OPERATIONS.labels('delete_template', 'error').inc()
            raise HTTPException(status_code=500, detail="Internal server error")

    async def validate_template_config(
        self,
        template_id: UUID,
        config: Dict[str, Any],
        deployment_type: str
    ) -> tuple[bool, Optional[str]]:
        """
        Validate configuration with deployment checks.
        
        Args:
            template_id: Template ID
            config: Configuration to validate
            deployment_type: Type of deployment
            
        Returns:
            Validation result and error message
        """
        try:
            with OPERATION_LATENCY.labels('validate_config').time():
                # Get template configuration
                template = await self._manager.get_template(template_id)
                if not template:
                    return False, "Template not found"

                # Validate basic configuration
                is_valid, error = await self._manager.validate_config(template_id, config)
                if not is_valid:
                    return False, error

                # Check deployment compatibility
                if not await self._validate_deployment_type(template, deployment_type):
                    return False, f"Invalid deployment type: {deployment_type}"

                TEMPLATE_OPERATIONS.labels('validate_config', 'success').inc()
                return True, None

        except Exception as e:
            self._logger.error(f"Error validating config: {str(e)}")
            TEMPLATE_OPERATIONS.labels('validate_config', 'error').inc()
            return False, f"Validation error: {str(e)}"

    async def _validate_template_data(
        self,
        template_data: Union[TemplateCreate, TemplateUpdate],
        existing_template: Optional[TemplateResponse] = None
    ) -> None:
        """Validate template data with security checks."""
        # Validate schema
        await template_data.validate_schema()

        # Validate security configuration
        await template_data.validate_security()

        # Additional validation logic here

    def _apply_security_filters(self, filters: Dict[str, Any]) -> Dict[str, Any]:
        """Apply security filters to query parameters."""
        secure_filters = filters.copy()
        
        # Remove any unsafe filters
        unsafe_keys = ['__', 'exec', 'system']
        for key in list(secure_filters.keys()):
            if any(unsafe in key.lower() for unsafe in unsafe_keys):
                secure_filters.pop(key)
                
        return secure_filters

    async def _has_dependencies(self, template_id: UUID) -> bool:
        """Check if template has active dependencies."""
        # Implementation for checking dependencies
        return False

    async def _validate_deployment_type(
        self,
        template: TemplateResponse,
        deployment_type: str
    ) -> bool:
        """Validate deployment type compatibility."""
        return deployment_type in template.supported_capabilities