# Core project variables
variable "project_name" {
  type        = string
  description = "Name of the project used for resource naming and tagging"
}

variable "environment" {
  type        = string
  description = "Environment name (dev/staging/prod) for resource configuration"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC where security resources will be deployed"
}

# Cognito configuration
variable "cognito_config" {
  type = object({
    user_pool_name                = string
    email_verification_required   = bool
    mfa_configuration            = string
    password_policy = object({
      minimum_length    = number
      require_lowercase = bool
      require_numbers   = bool
      require_symbols   = bool
      require_uppercase = bool
    })
    allowed_oauth_flows          = list(string)
    allowed_oauth_scopes        = list(string)
    callback_urls              = list(string)
    identity_providers         = list(string)
    user_groups               = list(object({
      name        = string
      description = string
      precedence  = number
    }))
  })
  description = "Configuration for Cognito user pool and client settings"
}

# KMS encryption configuration
variable "kms_config" {
  type = object({
    deletion_window_in_days = number
    enable_key_rotation    = bool
    key_usage             = string
    alias_name            = string
    key_administrators    = list(string)
    key_users            = list(string)
    encrypted_resources   = list(string)
  })
  description = "Configuration for KMS encryption keys and policies"
}

# WAF configuration
variable "waf_rules" {
  type = list(object({
    name            = string
    priority        = number
    rule_type       = string
    action          = string
    ip_rate_limit   = optional(number)
    blocked_ip_list = optional(list(string))
    sql_injection_protection = optional(bool)
    xss_protection         = optional(bool)
    size_constraint_bytes  = optional(number)
  }))
  description = "List of WAF rules for application protection"
}

# Security group configuration
variable "security_groups" {
  type = list(object({
    name        = string
    description = string
    ingress_rules = list(object({
      from_port   = number
      to_port     = number
      protocol    = string
      cidr_blocks = list(string)
      description = string
    }))
    egress_rules = list(object({
      from_port   = number
      to_port     = number
      protocol    = string
      cidr_blocks = list(string)
      description = string
    }))
  }))
  description = "Security group configurations for network access control"
}

# Network ACL configuration
variable "network_acls" {
  type = list(object({
    name        = string
    subnet_ids  = list(string)
    ingress_rules = list(object({
      rule_number = number
      protocol    = string
      from_port   = number
      to_port     = number
      cidr_block  = string
      action      = string
    }))
    egress_rules = list(object({
      rule_number = number
      protocol    = string
      from_port   = number
      to_port     = number
      cidr_block  = string
      action      = string
    }))
  }))
  description = "Network ACL rules for subnet protection"
}

# Security monitoring configuration
variable "monitoring_config" {
  type = object({
    enable_guardduty         = bool
    enable_security_hub      = bool
    enable_cloudtrail       = bool
    cloudtrail_retention_days = number
    alert_email_endpoints    = list(string)
    metric_filters = list(object({
      name           = string
      pattern        = string
      metric_name    = string
      metric_value   = number
      metric_namespace = string
    }))
    finding_aggregation_region = string
  })
  description = "Configuration for security monitoring and alerting services"
}

# Compliance and audit configuration
variable "compliance_config" {
  type = object({
    enable_config_recorder    = bool
    config_recording_group    = list(string)
    enable_aws_config_rules  = bool
    compliance_rules = list(object({
      name            = string
      source_identifier = string
      input_parameters = map(string)
    }))
    audit_log_retention_days = number
    enable_access_analyzer  = bool
  })
  description = "Configuration settings for compliance and audit requirements"
}

# Resource tagging
variable "tags" {
  type        = map(string)
  description = "Map of tags to be applied to all security resources for compliance and tracking"
  default     = {}
}