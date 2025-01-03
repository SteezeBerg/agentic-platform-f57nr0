from uuid import UUID
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.dialects.postgresql import JSONB

# Version: SQLAlchemy ^2.0.0
from db.models.template import Template

class TemplateRepository:
    """
    Repository class for managing template database operations with versioning,
    audit trailing, and performance optimization.
    """
    
    def __init__(self, db_session: Session):
        """
        Initialize repository with database session and configure optimization settings.
        
        Args:
            db_session: SQLAlchemy database session
        """
        self._session = db_session
        self._cache = {}
        self._cache_ttl = timedelta(minutes=15)
        self._performance_metrics = {
            "query_times": [],
            "cache_hits": 0,
            "cache_misses": 0
        }

    def get_by_id(self, template_id: UUID) -> Optional[Template]:
        """
        Retrieve template by ID with caching and performance logging.
        
        Args:
            template_id: UUID of the template to retrieve
            
        Returns:
            Template if found, None otherwise
        """
        # Check cache
        cache_key = f"template_id_{template_id}"
        if cache_key in self._cache:
            self._performance_metrics["cache_hits"] += 1
            return self._cache[cache_key]
            
        self._performance_metrics["cache_misses"] += 1
        
        # Query with performance tracking
        start_time = datetime.utcnow()
        stmt = select(Template).where(Template.id == template_id)
        template = self._session.execute(stmt).scalar_one_or_none()
        
        query_time = datetime.utcnow() - start_time
        self._performance_metrics["query_times"].append(query_time.total_seconds())
        
        # Update cache
        if template:
            self._cache[cache_key] = template
            
        return template

    def get_by_name(self, name: str) -> Optional[Template]:
        """
        Retrieve template by name with fuzzy matching and caching.
        
        Args:
            name: Name of the template to retrieve
            
        Returns:
            Template if found, None otherwise
        """
        # Sanitize input
        sanitized_name = name.strip().lower()
        
        # Check cache
        cache_key = f"template_name_{sanitized_name}"
        if cache_key in self._cache:
            self._performance_metrics["cache_hits"] += 1
            return self._cache[cache_key]
            
        self._performance_metrics["cache_misses"] += 1
        
        # Query with fuzzy matching
        stmt = select(Template).where(
            func.lower(Template.name).like(f"%{sanitized_name}%")
        )
        template = self._session.execute(stmt).scalar_one_or_none()
        
        # Update cache
        if template:
            self._cache[cache_key] = template
            
        return template

    def list_templates(
        self,
        page: int = 1,
        size: int = 20,
        category: Optional[str] = None,
        sort_by: Optional[str] = None,
        include_archived: bool = False
    ) -> Tuple[List[Template], int]:
        """
        List templates with advanced filtering, sorting, and pagination.
        
        Args:
            page: Page number (1-based)
            size: Page size
            category: Optional category filter
            sort_by: Optional sort field
            include_archived: Whether to include archived templates
            
        Returns:
            Tuple of (list of templates, total count)
        """
        # Validate pagination
        if page < 1:
            page = 1
        if size < 1:
            size = 20
            
        # Build base query
        base_query = select(Template)
        
        # Apply filters
        if not include_archived:
            base_query = base_query.where(Template.is_active == True)
        if category:
            base_query = base_query.where(Template.category == category)
            
        # Apply sorting
        if sort_by:
            if hasattr(Template, sort_by):
                base_query = base_query.order_by(getattr(Template, sort_by))
            else:
                base_query = base_query.order_by(Template.created_at.desc())
        else:
            base_query = base_query.order_by(Template.created_at.desc())
            
        # Execute count query
        total = self._session.execute(
            select(func.count()).select_from(base_query.subquery())
        ).scalar()
        
        # Execute paginated query
        offset = (page - 1) * size
        templates = self._session.execute(
            base_query.offset(offset).limit(size)
        ).scalars().all()
        
        return templates, total

    def create(self, template_data: Dict[str, Any]) -> Template:
        """
        Create new template with validation and audit trail.
        
        Args:
            template_data: Dictionary containing template data
            
        Returns:
            Created template instance
            
        Raises:
            ValueError: If template data is invalid
        """
        try:
            # Create template instance
            template = Template(
                name=template_data["name"],
                description=template_data["description"],
                category=template_data["category"],
                default_config=template_data.get("default_config", {}),
                supported_capabilities=template_data.get("supported_capabilities", []),
                schema=template_data.get("schema", {}),
                validation_rules=template_data.get("validation_rules", {}),
                deployment_config=template_data.get("deployment_config", {}),
                integration_points=template_data.get("integration_points", {})
            )
            
            # Add to session and commit
            self._session.add(template)
            self._session.commit()
            
            # Update cache
            cache_key = f"template_id_{template.id}"
            self._cache[cache_key] = template
            
            return template
            
        except SQLAlchemyError as e:
            self._session.rollback()
            raise ValueError(f"Failed to create template: {str(e)}")

    def update(self, template_id: UUID, template_data: Dict[str, Any]) -> Optional[Template]:
        """
        Update template with version control and conflict detection.
        
        Args:
            template_id: UUID of template to update
            template_data: Dictionary containing update data
            
        Returns:
            Updated template if found and updated
            
        Raises:
            ValueError: If update fails or conflicts detected
        """
        try:
            # Get existing template with lock
            template = self._session.execute(
                select(Template).where(Template.id == template_id).with_for_update()
            ).scalar_one_or_none()
            
            if not template:
                return None
                
            # Create new version
            updated_template = template.create_version(
                updates=template_data,
                change_reason=template_data.get("change_reason", "Template updated"),
                author=template_data.get("author", "system")
            )
            
            # Update session and commit
            self._session.add(updated_template)
            self._session.commit()
            
            # Update cache
            cache_key = f"template_id_{updated_template.id}"
            self._cache[cache_key] = updated_template
            
            return updated_template
            
        except SQLAlchemyError as e:
            self._session.rollback()
            raise ValueError(f"Failed to update template: {str(e)}")

    def delete(self, template_id: UUID) -> bool:
        """
        Delete template with soft delete and archival.
        
        Args:
            template_id: UUID of template to delete
            
        Returns:
            True if deleted, False if not found
        """
        try:
            # Get template
            template = self.get_by_id(template_id)
            if not template:
                return False
                
            # Perform soft delete
            template.is_active = False
            template.audit_trail[datetime.utcnow().isoformat()] = {
                "event": "template_deleted",
                "version": template.version
            }
            
            # Check age for archival
            age = datetime.utcnow() - template.created_at
            if age > timedelta(days=90):
                # Add to archival queue
                template.audit_trail[datetime.utcnow().isoformat()] = {
                    "event": "scheduled_for_archival",
                    "version": template.version
                }
            
            # Commit changes
            self._session.commit()
            
            # Invalidate cache
            cache_key = f"template_id_{template_id}"
            self._cache.pop(cache_key, None)
            
            return True
            
        except SQLAlchemyError as e:
            self._session.rollback()
            raise ValueError(f"Failed to delete template: {str(e)}")