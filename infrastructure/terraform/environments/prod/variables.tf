# Production environment identifier
variable "environment" {
  type        = string
  description = "Production environment identifier"
  default     = "prod"
}

# AWS region for production deployment
variable "aws_region" {
  type        = string
  description = "AWS region for production deployment"
  
  validation {
    condition     = can(regex("^(us|eu|ap|sa|ca|me|af)-(north|south|east|west|central)-[1-9]$", var.aws_region))
    error_message = "Must be a valid AWS region identifier."
  }
}

# Production VPC configuration
variable "vpc_cidr" {
  type        = string
  description = "Production VPC CIDR block"
  
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR block must be a valid IPv4 CIDR notation."
  }
}

# High availability configuration
variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones for production multi-AZ deployment"
  
  validation {
    condition     = length(var.availability_zones) >= 3
    error_message = "Production environment requires at least 3 availability zones for high availability."
  }
}

# ECS cluster configuration
variable "ecs_cluster_name" {
  type        = string
  description = "Production ECS cluster name for Agent Builder Hub"
}

# DynamoDB configuration
variable "dynamodb_table_names" {
  type        = map(string)
  description = "Production DynamoDB table names for Agent Builder Hub components"
}

# Aurora PostgreSQL configuration
variable "aurora_cluster_name" {
  type        = string
  description = "Production Aurora PostgreSQL cluster name for transactional data"
}

# OpenSearch configuration
variable "opensearch_domain_name" {
  type        = string
  description = "Production OpenSearch domain name for knowledge base indexing"
}

# CloudWatch configuration
variable "cloudwatch_retention_days" {
  type        = number
  description = "CloudWatch log retention period in days for production environment"
  default     = 365
  
  validation {
    condition     = contains([0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.cloudwatch_retention_days)
    error_message = "CloudWatch log retention days must be a valid value."
  }
}

# Network configuration
variable "enable_nat_gateway" {
  type        = bool
  description = "Enable NAT gateway for production private subnets"
  default     = true
}

# Cost optimization configuration
variable "enable_spot_capacity" {
  type        = bool
  description = "Enable FARGATE_SPOT capacity provider for production cost optimization"
  default     = false
}

# Resource tagging
variable "tags" {
  type        = map(string)
  description = "Production environment resource tags"
  
  validation {
    condition     = contains(keys(var.tags), "Environment") && contains(keys(var.tags), "Application")
    error_message = "Tags must include at least Environment and Application keys."
  }
  
  default = {
    Environment = "prod"
    Application = "agent-builder-hub"
    ManagedBy   = "terraform"
    CostCenter  = "production"
    Compliance  = "sox"
  }
}