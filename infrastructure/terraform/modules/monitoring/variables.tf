# Project name variable for resource naming and tagging
variable "project" {
  type        = string
  description = "Project name used for resource naming and tagging across monitoring infrastructure"
  
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project))
    error_message = "Project name must contain only lowercase letters, numbers, and hyphens."
  }
}

# Environment name variable for environment-specific configuration
variable "environment" {
  type        = string
  description = "Environment name (dev/staging/prod) for environment-specific monitoring configuration"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Log retention configuration
variable "log_retention_days" {
  type        = number
  description = "Number of days to retain CloudWatch logs with compliance considerations"
  default     = 90

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "Log retention days must be one of the allowed CloudWatch values."
  }
}

# Alarm notification endpoints
variable "alarm_email_endpoints" {
  type        = list(string)
  description = "List of email endpoints for CloudWatch alarm notifications"

  validation {
    condition     = length(var.alarm_email_endpoints) > 0
    error_message = "At least one alarm email endpoint must be provided."
  }

  validation {
    condition     = alltrue([for email in var.alarm_email_endpoints : can(regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", email))])
    error_message = "All email endpoints must be valid email addresses."
  }
}

# API performance monitoring thresholds
variable "api_latency_threshold" {
  type        = number
  description = "API Gateway latency threshold in milliseconds for performance monitoring"
  default     = 100

  validation {
    condition     = var.api_latency_threshold > 0 && var.api_latency_threshold <= 1000
    error_message = "API latency threshold must be between 1 and 1000 milliseconds."
  }
}

# Error rate monitoring threshold
variable "error_rate_threshold" {
  type        = number
  description = "Error rate percentage threshold for service health monitoring"
  default     = 1

  validation {
    condition     = var.error_rate_threshold >= 0 && var.error_rate_threshold <= 100
    error_message = "Error rate threshold must be between 0 and 100 percent."
  }
}

# Resource utilization thresholds
variable "cpu_utilization_threshold" {
  type        = number
  description = "CPU utilization percentage threshold for container resource monitoring"
  default     = 80

  validation {
    condition     = var.cpu_utilization_threshold > 0 && var.cpu_utilization_threshold <= 100
    error_message = "CPU utilization threshold must be between 1 and 100 percent."
  }
}

variable "memory_utilization_threshold" {
  type        = number
  description = "Memory utilization percentage threshold for container resource monitoring"
  default     = 80

  validation {
    condition     = var.memory_utilization_threshold > 0 && var.memory_utilization_threshold <= 100
    error_message = "Memory utilization threshold must be between 1 and 100 percent."
  }
}

# X-Ray tracing configuration
variable "xray_sampling_rate" {
  type        = number
  description = "X-Ray tracing sampling rate percentage for distributed tracing configuration"
  default     = 5

  validation {
    condition     = var.xray_sampling_rate >= 1 && var.xray_sampling_rate <= 100
    error_message = "X-Ray sampling rate must be between 1 and 100 percent."
  }
}