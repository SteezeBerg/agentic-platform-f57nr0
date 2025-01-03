# Core variable definitions for compute module managing ECS and Lambda resources
# terraform ~> 1.0

variable "environment" {
  type        = string
  description = "Environment name for resource naming and tagging"
  
  validation {
    condition     = length(var.environment) > 0
    error_message = "Environment name cannot be empty"
  }
}

variable "project" {
  type        = string
  description = "Project name for resource naming and tagging"
  default     = "AgentBuilderHub"
}

variable "tags" {
  type        = map(string)
  description = "Common tags to apply to all compute resources"
  default     = {}
}

variable "ecs_cluster_name" {
  type        = string
  description = "Name of the ECS cluster for running containerized services"
  
  validation {
    condition     = length(var.ecs_cluster_name) > 0
    error_message = "ECS cluster name cannot be empty"
  }
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC where compute resources will be deployed"
  
  validation {
    condition     = can(regex("^vpc-", var.vpc_id))
    error_message = "VPC ID must be valid"
  }
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for ECS tasks and Lambda functions"
  
  validation {
    condition     = length(var.private_subnet_ids) > 0
    error_message = "At least one private subnet ID must be provided"
  }
}

variable "ecs_security_group_id" {
  type        = string
  description = "Security group ID for ECS tasks"
  
  validation {
    condition     = can(regex("^sg-", var.ecs_security_group_id))
    error_message = "Security group ID must be valid"
  }
}

variable "services" {
  type = map(object({
    cpu                               = number
    memory                           = number
    min_tasks                        = number
    max_tasks                        = number
    desired_count                    = number
    container_port                   = number
    health_check_path                = string
    auto_scaling_enabled             = bool
    auto_scaling_target_cpu_percent  = number
    auto_scaling_target_memory_percent = number
    auto_scaling_cooldown_seconds    = number
  }))
  description = "Map of service configurations for agent runtime, API, and web interface"
  
  validation {
    condition     = alltrue([for s in var.services : s.cpu >= 256 && s.memory >= 512])
    error_message = "CPU must be >= 256 and memory >= 512"
  }
}

variable "lambda_functions" {
  type = map(object({
    handler                          = string
    runtime                         = string
    memory_size                     = number
    timeout                         = number
    environment_variables           = map(string)
    reserved_concurrent_executions  = number
    layers                         = list(string)
    vpc_config_enabled             = bool
  }))
  description = "Map of Lambda function configurations for serverless compute"
}

variable "execution_role_arn" {
  type        = string
  description = "ARN of the IAM role for ECS task execution"
  
  validation {
    condition     = can(regex("^arn:aws:iam::", var.execution_role_arn))
    error_message = "Execution role ARN must be valid"
  }
}

variable "task_role_arn" {
  type        = string
  description = "ARN of the IAM role for ECS task permissions"
  
  validation {
    condition     = can(regex("^arn:aws:iam::", var.task_role_arn))
    error_message = "Task role ARN must be valid"
  }
}

variable "enable_spot_capacity" {
  type        = bool
  description = "Enable FARGATE_SPOT capacity provider for cost optimization"
  default     = false
}

variable "cloudwatch_retention_days" {
  type        = number
  description = "Number of days to retain CloudWatch logs"
  default     = 30
  
  validation {
    condition     = contains([0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.cloudwatch_retention_days)
    error_message = "CloudWatch retention days must be a valid value"
  }
}