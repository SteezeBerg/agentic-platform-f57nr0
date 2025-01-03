# Environment Identification
variable "environment" {
  type        = string
  description = "Environment identifier for staging deployment"
  default     = "staging"
}

# Region Configuration
variable "aws_region" {
  type        = string
  description = "AWS region for staging environment deployment (e.g., us-west-2)"
}

# Network Configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for staging VPC network (e.g., 10.1.0.0/16)"
}

variable "availability_zones" {
  type        = list(string)
  description = "List of AWS availability zones for staging multi-AZ deployment"
}

# Compute Resources
variable "ecs_cluster_name" {
  type        = string
  description = "Name prefix for staging ECS cluster used for agent workloads"
}

# Database Resources
variable "dynamodb_table_names" {
  type        = map(string)
  description = "Map of DynamoDB table names for staging environment (e.g., agents, deployments, metrics)"
}

variable "aurora_cluster_name" {
  type        = string
  description = "Name prefix for staging Aurora PostgreSQL cluster for transactional data"
}

# Search Resources
variable "opensearch_domain_name" {
  type        = string
  description = "Name prefix for staging OpenSearch domain used for knowledge base indexing"
}

# Monitoring Configuration
variable "cloudwatch_retention_days" {
  type        = number
  description = "Number of days to retain CloudWatch logs in staging environment"
  default     = 30
}

# Resource Tagging
variable "tags" {
  type        = map(string)
  description = "Resource tags for staging environment cost allocation and management"
  default = {
    Environment = "staging"
    Project     = "agent-builder-hub"
    ManagedBy   = "terraform"
    Purpose     = "pre-production-validation"
  }
}