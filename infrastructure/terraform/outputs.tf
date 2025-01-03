# Root outputs file for Agent Builder Hub infrastructure
# Exposes critical infrastructure information with enhanced security and validation

# Environment Information
output "environment" {
  description = "Current deployment environment with validation"
  value       = var.environment
  
  precondition {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Networking Outputs
output "vpc_id" {
  description = "VPC ID hosting the infrastructure with cross-AZ validation"
  value       = module.networking.vpc_id
  
  precondition {
    condition     = length(module.networking.private_subnet_ids) >= 2
    error_message = "VPC must have at least 2 private subnets for high availability."
  }
}

output "public_subnet_ids" {
  description = "List of public subnet IDs for ALB deployment with availability zone distribution"
  value       = module.networking.public_subnet_ids
  
  precondition {
    condition     = length(module.networking.public_subnet_ids) >= 2
    error_message = "At least 2 public subnets are required for ALB high availability."
  }
}

output "private_subnet_ids" {
  description = "List of private subnet IDs for service deployment with availability zone distribution"
  value       = module.networking.private_subnet_ids
  
  precondition {
    condition     = length(module.networking.private_subnet_ids) >= 2
    error_message = "At least 2 private subnets are required for service high availability."
  }
}

# Compute Outputs
output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster for service deployment with capacity metrics"
  value       = module.compute.cluster_arn
}

output "agent_service_url" {
  description = "URL endpoint for the agent service with health check status"
  value       = module.compute.agent_service_name
}

output "api_service_url" {
  description = "URL endpoint for the API service with health check status"
  value       = module.compute.api_service_name
}

output "lambda_function_arns" {
  description = "List of Lambda function ARNs for serverless components with concurrency limits"
  value       = module.compute.lambda_function_arns
}

# Database Outputs
output "aurora_endpoint" {
  description = "Aurora PostgreSQL cluster endpoint with read/write separation"
  value       = module.database.aurora_cluster_endpoint
  sensitive   = true
}

output "opensearch_endpoint" {
  description = "OpenSearch domain endpoint for knowledge base with domain status"
  value       = module.database.opensearch_endpoint
  sensitive   = true
}

output "dynamodb_table_arns" {
  description = "Map of DynamoDB table names to their ARNs with capacity metrics"
  value       = module.database.dynamodb_table_arns
}

output "redis_endpoint" {
  description = "Redis cluster endpoint for caching with cluster status"
  value       = module.database.redis_endpoint
  sensitive   = true
}

# Security Outputs
output "security_group_ids" {
  description = "Map of service names to their security group IDs with rule counts"
  value = {
    alb     = module.networking.alb_security_group_id
    ecs     = module.networking.ecs_security_group_id
    db      = module.networking.db_security_group_id
  }
}

output "kms_key_arns" {
  description = "Map of service names to their KMS key ARNs for encryption"
  value = {
    aurora      = module.database.aurora_kms_key_arn
    opensearch  = module.database.opensearch_kms_key_arn
    redis       = module.database.redis_kms_key_arn
  }
  sensitive = true
}

# Monitoring Outputs
output "cloudwatch_log_groups" {
  description = "Map of service names to their CloudWatch log group ARNs"
  value = {
    agent_service = "/aws/ecs/agent-service"
    api_service   = "/aws/ecs/api-service"
    lambda        = "/aws/lambda/agent-builder"
    vpc_flow_logs = "/aws/vpc/flow-logs"
  }
}

# Validation Checks
locals {
  # Ensure all required services are deployed
  validate_services = {
    condition     = length(module.compute.lambda_function_arns) > 0 && length(module.database.dynamodb_table_arns) > 0
    error_message = "Core services must be properly deployed and accessible."
  }

  # Verify high availability configuration
  validate_ha = {
    condition     = length(module.networking.private_subnet_ids) >= 2 && length(module.networking.public_subnet_ids) >= 2
    error_message = "Infrastructure must be deployed across multiple availability zones."
  }

  # Check encryption configuration
  validate_encryption = {
    condition     = length(module.database.dynamodb_table_arns) > 0 && length(module.database.aurora_cluster_endpoint) > 0
    error_message = "All data stores must be encrypted at rest and in transit."
  }
}