"""
AWS Cognito integration module for Agent Builder Hub.
Provides secure user authentication, token management, and user pool operations with enhanced security features.
Version: 1.0.0
"""

import boto3
from botocore.exceptions import ClientError
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
import redis

from config.aws import get_client
from schemas.auth import TokenPayload
from core.auth.tokens import create_access_token
from utils.logging import AuditLogger

# Global constants for configuration
COGNITO_CLIENT = get_client('cognito-idp')
USER_POOL_ID = get_settings().aws_config.cognito_user_pool_id
CLIENT_ID = get_settings().aws_config.cognito_client_id
MAX_RETRY_ATTEMPTS = 3
RATE_LIMIT_WINDOW = 300  # 5 minutes
MAX_LOGIN_ATTEMPTS = 5

class CognitoAuth:
    """Enhanced AWS Cognito authentication manager with comprehensive security features."""

    def __init__(self):
        """Initialize Cognito client with security and monitoring configuration."""
        self._client = COGNITO_CLIENT
        self._user_pool_id = USER_POOL_ID
        self._client_id = CLIENT_ID
        
        # Initialize Redis for rate limiting and token revocation
        self._rate_limiter = redis.Redis(
            host=get_settings().redis_config.host,
            port=get_settings().redis_config.port,
            password=get_settings().redis_config.password,
            ssl=True,
            decode_responses=True
        )
        
        # Initialize audit logger
        self._audit_logger = AuditLogger('cognito_auth')

    async def authenticate(
        self,
        username: str,
        password: str,
        ip_address: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Authenticate user with enhanced security checks and rate limiting.
        
        Args:
            username: User's email or username
            password: User's password
            ip_address: Optional client IP for rate limiting
            
        Returns:
            Dict containing authentication tokens and user info
        """
        try:
            # Check IP-based rate limiting
            if ip_address:
                ip_key = f"auth_attempts:ip:{ip_address}"
                if self._rate_limiter.get(ip_key) and \
                   int(self._rate_limiter.get(ip_key)) >= MAX_LOGIN_ATTEMPTS:
                    self._audit_logger.log_security_event(
                        'authentication_blocked',
                        {'reason': 'rate_limit_exceeded', 'ip_address': ip_address}
                    )
                    raise ValueError("Too many login attempts. Please try again later.")
                
                self._rate_limiter.incr(ip_key)
                self._rate_limiter.expire(ip_key, RATE_LIMIT_WINDOW)

            # Check username-based rate limiting
            username_key = f"auth_attempts:user:{username}"
            if self._rate_limiter.get(username_key) and \
               int(self._rate_limiter.get(username_key)) >= MAX_LOGIN_ATTEMPTS:
                self._audit_logger.log_security_event(
                    'authentication_blocked',
                    {'reason': 'rate_limit_exceeded', 'username': username}
                )
                raise ValueError("Account temporarily locked. Please try again later.")
                
            self._rate_limiter.incr(username_key)
            self._rate_limiter.expire(username_key, RATE_LIMIT_WINDOW)

            # Attempt authentication with retries
            for attempt in range(MAX_RETRY_ATTEMPTS):
                try:
                    auth_response = self._client.initiate_auth(
                        AuthFlow='USER_PASSWORD_AUTH',
                        AuthParameters={
                            'USERNAME': username,
                            'PASSWORD': password
                        },
                        ClientId=self._client_id
                    )
                    break
                except ClientError as e:
                    if attempt == MAX_RETRY_ATTEMPTS - 1:
                        raise
                    continue

            # Handle MFA if enabled
            if auth_response.get('ChallengeName') == 'SMS_MFA':
                self._audit_logger.log_security_event(
                    'mfa_required',
                    {'username': username}
                )
                return {
                    'status': 'mfa_required',
                    'session': auth_response['Session']
                }

            # Generate enhanced tokens
            auth_result = auth_response['AuthenticationResult']
            access_token = create_access_token(
                subject=username,
                scopes=self._get_user_scopes(username),
                metadata={
                    'cognito_token': auth_result['AccessToken'],
                    'device_key': auth_result.get('DeviceKey')
                }
            )

            # Clear rate limiting counters on successful auth
            self._rate_limiter.delete(username_key)
            if ip_address:
                self._rate_limiter.delete(ip_key)

            # Log successful authentication
            self._audit_logger.log_security_event(
                'authentication_successful',
                {
                    'username': username,
                    'ip_address': ip_address,
                    'mfa_completed': auth_response.get('ChallengeName') == 'SMS_MFA'
                }
            )

            return {
                'access_token': access_token,
                'refresh_token': auth_result['RefreshToken'],
                'id_token': auth_result['IdToken'],
                'expires_in': auth_result['ExpiresIn'],
                'token_type': auth_result['TokenType']
            }

        except ClientError as e:
            error_response = handle_cognito_error(e, 'authentication')
            self._audit_logger.log_security_event(
                'authentication_failed',
                {
                    'username': username,
                    'ip_address': ip_address,
                    'error': error_response['error']
                }
            )
            raise ValueError(error_response['message'])

        except Exception as e:
            self._audit_logger.log_security_event(
                'authentication_error',
                {
                    'username': username,
                    'ip_address': ip_address,
                    'error': str(e)
                }
            )
            raise

    async def verify_token(
        self,
        token: str,
        required_scopes: Optional[List[str]] = None
    ) -> TokenPayload:
        """
        Verify Cognito token with enhanced security checks.
        
        Args:
            token: JWT token to verify
            required_scopes: Optional list of required authorization scopes
            
        Returns:
            TokenPayload: Validated token payload
        """
        try:
            # Check token revocation status
            if self._is_token_revoked(token):
                self._audit_logger.log_security_event(
                    'token_verification_failed',
                    {'reason': 'token_revoked'}
                )
                raise ValueError("Token has been revoked")

            # Verify token with Cognito
            try:
                token_payload = self._client.get_user(
                    AccessToken=token
                )
            except ClientError as e:
                error_response = handle_cognito_error(e, 'token_verification')
                self._audit_logger.log_security_event(
                    'token_verification_failed',
                    {'error': error_response['error']}
                )
                raise ValueError(error_response['message'])

            # Extract and validate claims
            user_attributes = {
                attr['Name']: attr['Value']
                for attr in token_payload['UserAttributes']
            }

            # Verify required scopes if provided
            if required_scopes:
                user_scopes = user_attributes.get('custom:scopes', '').split(',')
                if not all(scope in user_scopes for scope in required_scopes):
                    self._audit_logger.log_security_event(
                        'token_verification_failed',
                        {
                            'reason': 'insufficient_scopes',
                            'required': required_scopes,
                            'provided': user_scopes
                        }
                    )
                    raise ValueError("Insufficient scopes")

            # Create validated token payload
            validated_payload = TokenPayload(
                sub=user_attributes['sub'],
                exp=int(user_attributes.get('exp', 0)),
                scopes=user_scopes if required_scopes else []
            )

            # Log successful verification
            self._audit_logger.log_security_event(
                'token_verification_successful',
                {'sub': validated_payload.sub}
            )

            return validated_payload

        except Exception as e:
            self._audit_logger.log_security_event(
                'token_verification_error',
                {'error': str(e)}
            )
            raise

    def _is_token_revoked(self, token: str) -> bool:
        """Check if token has been revoked."""
        return bool(self._rate_limiter.get(f"revoked_token:{token}"))

    def _get_user_scopes(self, username: str) -> List[str]:
        """Get user's authorization scopes from Cognito groups."""
        try:
            response = self._client.admin_list_groups_for_user(
                Username=username,
                UserPoolId=self._user_pool_id
            )
            return [group['GroupName'] for group in response['Groups']]
        except Exception as e:
            self._audit_logger.log_security_event(
                'scope_retrieval_error',
                {'username': username, 'error': str(e)}
            )
            return []

def handle_cognito_error(error: Exception, operation: str) -> Dict[str, str]:
    """
    Handle Cognito errors with detailed responses.
    
    Args:
        error: The caught exception
        operation: The operation being performed
        
    Returns:
        Dict containing error details
    """
    error_code = error.response['Error']['Code']
    error_message = error.response['Error']['Message']
    
    error_mapping = {
        'NotAuthorizedException': 'Invalid username or password',
        'UserNotFoundException': 'User does not exist',
        'UsernameExistsException': 'Username already exists',
        'InvalidPasswordException': 'Password does not meet requirements',
        'CodeMismatchException': 'Invalid verification code',
        'ExpiredCodeException': 'Verification code has expired',
        'TooManyRequestsException': 'Too many requests, please try again later',
        'InvalidParameterException': 'Invalid parameters provided'
    }

    return {
        'error': error_code,
        'message': error_mapping.get(error_code, error_message),
        'operation': operation
    }