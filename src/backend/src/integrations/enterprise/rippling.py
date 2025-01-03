"""
Enterprise-grade Rippling HR platform integration module providing secure access to employee data,
onboarding workflows, and HR operations with comprehensive monitoring and data protection.
Version: 1.0.0
"""

import json
from typing import Dict, Optional, Tuple, List
from datetime import datetime
from dataclasses import dataclass

# Third-party imports with versions
import requests  # ^2.31.0
from pydantic import BaseModel, Field, validator  # ^2.0.0
from tenacity import retry, stop_after_attempt, wait_exponential  # ^8.0.0
from cachetools import TTLCache  # ^5.0.0

# Internal imports
from config.settings import get_settings
from utils.logging import StructuredLogger
from utils.encryption import EncryptionService

# Global constants
RIPPLING_API_VERSION = "v1"
RIPPLING_BASE_URL = "https://api.rippling.com"
SENSITIVE_FIELDS = ["ssn", "tax_id", "bank_info", "salary", "personal_email"]
MAX_RETRIES = 3
CACHE_TTL = 300  # 5 minutes

class RipplingEmployee(BaseModel):
    """Enhanced Pydantic model for Rippling employee data with encryption and validation."""
    
    id: str = Field(..., description="Unique employee identifier")
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    email: str = Field(..., regex=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
    department: Optional[str] = None
    role: Optional[str] = None
    start_date: datetime
    sensitive_data: Dict = Field(default_factory=dict)
    audit_trail: Dict = Field(default_factory=dict)

    @validator('email')
    def validate_email_domain(cls, v):
        """Validate email domain against allowed domains."""
        domain = v.split('@')[1]
        settings = get_settings()
        if domain not in settings.security_config.allowed_domains:
            raise ValueError(f"Invalid email domain: {domain}")
        return v

    def to_dict(self, include_sensitive: bool = False) -> Dict:
        """Convert employee data to dictionary with encryption handling."""
        data = self.dict(exclude={'sensitive_data', 'audit_trail'})
        
        if include_sensitive:
            settings = get_settings()
            encryption_service = EncryptionService(
                settings.security_config.encryption_key,
                encryption_context={'purpose': 'employee_data'}
            )
            
            for field, value in self.sensitive_data.items():
                if isinstance(value, str):
                    data[field] = encryption_service.decrypt_data(value)
                
        return data

class RipplingClient:
    """Enhanced client for secure interaction with Rippling HR platform API."""

    def __init__(self, api_key: str, config: Optional[Dict] = None):
        """Initialize Rippling client with security and monitoring features."""
        self._api_key = api_key
        self._base_url = f"{RIPPLING_BASE_URL}/{RIPPLING_API_VERSION}"
        self._logger = StructuredLogger('rippling_client')
        
        # Initialize session with security headers
        self._session = requests.Session()
        self._session.headers.update({
            'Authorization': f'Bearer {self._api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'AgentBuilderHub/1.0',
            'X-Api-Version': RIPPLING_API_VERSION
        })

        # Initialize response cache
        self._cache = TTLCache(maxsize=100, ttl=CACHE_TTL)

        # Initialize encryption service
        settings = get_settings()
        self._encryptor = EncryptionService(
            settings.security_config.encryption_key,
            encryption_context={'service': 'rippling'}
        )

        self._logger.log('info', 'Initialized Rippling client', {
            'base_url': self._base_url,
            'cache_enabled': bool(self._cache)
        })

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    def get_employee(self, employee_id: str, include_sensitive: bool = False) -> Dict:
        """Securely retrieve employee information with encryption handling."""
        cache_key = f"employee_{employee_id}"
        
        # Check cache first
        if cache_key in self._cache and not include_sensitive:
            self._logger.log('info', 'Retrieved employee from cache', {
                'employee_id': employee_id
            })
            return self._cache[cache_key]

        try:
            response = self._session.get(
                f"{self._base_url}/employees/{employee_id}"
            )
            response.raise_for_status()
            
            # Process and validate response
            employee_data = response.json()
            
            # Handle sensitive field encryption
            for field in SENSITIVE_FIELDS:
                if field in employee_data:
                    employee_data[field] = self._encryptor.encrypt_data(
                        str(employee_data[field]),
                        check_pii=True
                    )

            # Create validated employee model
            employee = RipplingEmployee(
                **employee_data,
                audit_trail={
                    'retrieved_at': datetime.utcnow().isoformat(),
                    'retrieved_by': 'agent_builder_hub'
                }
            )

            # Cache non-sensitive data
            if not include_sensitive:
                self._cache[cache_key] = employee.to_dict(include_sensitive=False)

            self._logger.log('info', 'Retrieved employee data', {
                'employee_id': employee_id,
                'include_sensitive': include_sensitive
            })

            return employee.to_dict(include_sensitive=include_sensitive)

        except requests.exceptions.RequestException as e:
            self._logger.log('error', 'Failed to retrieve employee', {
                'employee_id': employee_id,
                'error': str(e)
            })
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    def list_employees(
        self,
        filters: Optional[Dict] = None,
        page_size: int = 50,
        cursor: Optional[str] = None
    ) -> Tuple[List[Dict], Optional[str]]:
        """Retrieve list of employees with pagination and filtering."""
        try:
            params = {
                'page_size': min(page_size, 100),  # Enforce reasonable page size
                'cursor': cursor,
                **(filters or {})
            }

            response = self._session.get(
                f"{self._base_url}/employees",
                params=params
            )
            response.raise_for_status()
            
            data = response.json()
            employees = []
            
            for employee_data in data['employees']:
                # Handle sensitive field encryption
                for field in SENSITIVE_FIELDS:
                    if field in employee_data:
                        employee_data[field] = self._encryptor.encrypt_data(
                            str(employee_data[field]),
                            check_pii=True
                        )
                
                # Create validated employee model
                employee = RipplingEmployee(
                    **employee_data,
                    audit_trail={
                        'retrieved_at': datetime.utcnow().isoformat(),
                        'retrieved_by': 'agent_builder_hub'
                    }
                )
                employees.append(employee.to_dict(include_sensitive=False))

            self._logger.log('info', 'Retrieved employee list', {
                'count': len(employees),
                'has_more': bool(data.get('next_cursor'))
            })

            return employees, data.get('next_cursor')

        except requests.exceptions.RequestException as e:
            self._logger.log('error', 'Failed to list employees', {
                'error': str(e),
                'filters': filters
            })
            raise