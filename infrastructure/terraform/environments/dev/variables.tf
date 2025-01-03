# Development environment-specific variables for Agent Builder Hub infrastructure

# Environment identifier
variable "environment" {
  description = "Development environment identifier"
  type        = string
  default     = "dev"

  validation {
    condition     = var.environment == "dev"
    error_message = "This configuration is specifically for the development environment."
  }
}

# AWS Region
variable "aws_region" {
  description = "AWS region for development environment resources"
  type        = string
  default     = "us-west-2"

  validation {
    condition     = can(regex("^(us|eu|ap|sa|ca|me|af)-(north|south|east|west|central)-[1-9]$", var.aws_region))
    error_message = "Must be a valid AWS region identifier."
  }
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for development VPC"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR block must be a valid IPv4 CIDR notation."
  }
}

# Availability Zones
variable "availability_zones" {
  description = "List of AWS availability zones for development environment"
  type        = list(string)
  default     = ["us-west-2a", "us-west-2b"]

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones must be specified for high availability."
  }
}

# ECS Configuration
variable "ecs_cluster_name" {
  description = "Name for development ECS cluster"
  type        = string
  default     = "agent-builder-hub-dev"
}

variable "enable_spot_capacity" {
  description = "Flag to enable Fargate Spot capacity for cost optimization in development"
  type        = bool
  default     = true
}

# Database Configuration
variable "dynamodb_table_names" {
  description = "Map of DynamoDB table names for development environment"
  type        = map(string)
  default = {
    agents      = "agent-builder-hub-agents-dev"
    deployments = "agent-builder-hub-deployments-dev"
    knowledge   = "agent-builder-hub-knowledge-dev"
  }
}

variable "aurora_cluster_name" {
  description = "Name for development Aurora PostgreSQL cluster"
  type        = string
  default     = "agent-builder-hub-dev"
}

# Search Configuration
variable "opensearch_domain_name" {
  description = "Name for development OpenSearch domain"
  type        = string
  default     = "agent-builder-hub-dev"
}

# Monitoring Configuration
variable "cloudwatch_retention_days" {
  description = "Number of days to retain CloudWatch logs in development"
  type        = number
  default     = 14

  validation {
    condition     = contains([0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.cloudwatch_retention_days)
    error_message = "CloudWatch log retention days must be a valid value."
  }
}

# Resource Tags
variable "tags" {
  description = "Common resource tags for development environment"
  type        = map(string)
  default = {
    Environment = "dev"
    Application = "agent-builder-hub"
    ManagedBy   = "terraform"
    Team        = "platform"
    CostCenter  = "development"
  }

  validation {
    condition     = contains(keys(var.tags), "Environment") && var.tags["Environment"] == "dev"
    error_message = "Environment tag must be set to 'dev' for development environment."
  }
}