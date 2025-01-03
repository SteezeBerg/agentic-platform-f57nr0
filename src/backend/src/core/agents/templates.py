"""
Core module for managing agent templates with comprehensive validation, caching, and monitoring.
Provides enterprise-grade template management for the Agent Builder Hub.
Version: 1.0.0
"""

from typing import Dict, List, Optional, Any, Union, TypeVar, Generic
from uuid import UUID
import jsonschema  # ^4.0.0
from cachetools import LRUCache  # ^5.0.0
from prometheus_client import MetricsCollector  # ^0.16.0

from schemas.template import (
    TemplateBase, TemplateCreate, TemplateUpdate, TemplateResponse
)
from db.repositories.template_repository import TemplateRepository

# Global constants
SUPPORTED_DEPLOYMENT_TYPES = ["streamlit", "slack", "aws_react", "standalone"]
DEFAULT_PAGE_SIZE = 20
DEFAULT_CACHE_SIZE = 1000
TEMPLATE_VERSION_PREFIX = 'v'

class TemplateManager:
    """
    Core class for managing agent templates with enhanced caching, validation, and monitoring.
    Provides comprehensive template management capabilities for the Agent Builder Hub.
    """

    def __init__(self, template_repository: TemplateRepository, metrics_collector: MetricsCollector, cache_size: int = DEFAULT_CACHE_SIZE):
        """
        Initialize template manager with repository, cache, and metrics.

        Args:
            template_repository: Repository for template storage
            metrics_collector: Metrics collection service
            cache_size: Size of LRU cache
        """
        self._repository = template_repository
        self._cache = LRUCache(maxsize=cache_size)
        self._metrics = metrics_collector
        self._validators = self._initialize_validators()

    def _initialize_validators(self) -> Dict[str, Any]:
        """Initialize template validators for different deployment types."""
        return {
            "streamlit": {
                "required_fields": ["page_title", "layout", "theme"],
                "security_checks": ["authentication", "data_encryption"]
            },
            "slack": {
                "required_fields": ["bot_token", "signing_secret", "app_token"],
                "security_checks": ["token_validation", "request_signing"]
            },
            "aws_react": {
                "required_fields": ["aws_region", "cognito_pool_id", "api_endpoint"],
                "security_checks": ["iam_roles", "api_authentication"]
            },
            "standalone": {
                "required_fields": ["runtime", "environment", "dependencies"],
                "security_checks": ["environment_isolation", "dependency_scanning"]
            }
        }

    async def get_template(self, template_id: UUID) -> Optional[TemplateResponse]:
        """
        Retrieve template by ID with caching and metrics.

        Args:
            template_id: Unique identifier of the template

        Returns:
            Template response if found, None otherwise
        """
        # Check cache first
        cache_key = f"template_{str(template_id)}"
        if cache_key in self._cache:
            self._metrics.track_performance("template_cache_hit", 1)
            return self._cache[cache_key]

        self._metrics.track_performance("template_cache_miss", 1)

        # Query repository
        template = await self._repository.get_by_id(template_id)
        if not template:
            return None

        # Transform to response model
        response = TemplateResponse(
            id=template.id,
            name=template.name,
            description=template.description,
            category=template.category,
            default_config=template.default_config,
            supported_capabilities=template.supported_capabilities,
            schema=template.schema,
            is_active=template.is_active,
            owner_id=template.owner_id,
            security_config=template.security_config,
            performance_metrics=template.performance_metrics,
            usage_statistics=template.usage_statistics,
            created_at=template.created_at,
            updated_at=template.updated_at,
            last_modified_by=template.last_modified_by,
            version=f"{TEMPLATE_VERSION_PREFIX}{template.version}"
        )

        # Update cache
        self._cache[cache_key] = response
        self._metrics.track_performance("template_retrieved", 1)

        return response

    async def list_templates(
        self,
        page: int = 1,
        size: int = DEFAULT_PAGE_SIZE,
        category: Optional[str] = None,
        sort_by: Optional[str] = None,
        descending: bool = False
    ) -> tuple[List[TemplateResponse], int]:
        """
        List available templates with filtering and sorting.

        Args:
            page: Page number
            size: Page size
            category: Optional category filter
            sort_by: Optional sort field
            descending: Sort direction

        Returns:
            Tuple of (templates list, total count)
        """
        # Validate pagination parameters
        if page < 1:
            page = 1
        if size < 1:
            size = DEFAULT_PAGE_SIZE

        # Get templates from repository
        templates, total = await self._repository.list_templates(
            page=page,
            size=size,
            category=category,
            sort_by=sort_by,
            include_archived=False
        )

        # Transform to response models
        responses = [
            TemplateResponse(
                id=template.id,
                name=template.name,
                description=template.description,
                category=template.category,
                default_config=template.default_config,
                supported_capabilities=template.supported_capabilities,
                schema=template.schema,
                is_active=template.is_active,
                owner_id=template.owner_id,
                security_config=template.security_config,
                performance_metrics=template.performance_metrics,
                usage_statistics=template.usage_statistics,
                created_at=template.created_at,
                updated_at=template.updated_at,
                last_modified_by=template.last_modified_by,
                version=f"{TEMPLATE_VERSION_PREFIX}{template.version}"
            )
            for template in templates
        ]

        self._metrics.track_performance("templates_listed", len(responses))

        return responses, total

    async def validate_config(self, template_id: UUID, config: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """
        Validate agent configuration against template with security checks.

        Args:
            template_id: Template ID
            config: Configuration to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        template = await self.get_template(template_id)
        if not template:
            return False, "Template not found"

        try:
            # Validate against JSON schema
            jsonschema.validate(instance=config, schema=template.schema)

            # Validate deployment type requirements
            if template.category in self._validators:
                validator = self._validators[template.category]
                
                # Check required fields
                missing_fields = [
                    field for field in validator["required_fields"]
                    if field not in config
                ]
                if missing_fields:
                    return False, f"Missing required fields: {missing_fields}"

                # Perform security checks
                for check in validator["security_checks"]:
                    if check not in config.get("security", {}):
                        return False, f"Missing security configuration: {check}"

            # Validate capabilities
            if "capabilities" in config:
                unsupported = set(config["capabilities"]) - set(template.supported_capabilities)
                if unsupported:
                    return False, f"Unsupported capabilities: {unsupported}"

            self._metrics.track_performance("config_validation_success", 1)
            return True, None

        except jsonschema.exceptions.ValidationError as e:
            self._metrics.track_performance("config_validation_error", 1)
            return False, str(e)
        except Exception as e:
            self._metrics.track_performance("config_validation_error", 1)
            return False, f"Validation error: {str(e)}"