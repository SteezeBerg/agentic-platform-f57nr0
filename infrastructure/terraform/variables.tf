# Core environment configuration
variable "environment" {
  description = "Deployment environment (dev/staging/prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  
  validation {
    condition     = can(regex("^(us|eu|ap|sa|ca|me|af)-(north|south|east|west|central)-[1-9]$", var.aws_region))
    error_message = "Must be a valid AWS region identifier."
  }
}

# VPC Configuration
variable "vpc_config" {
  description = "VPC configuration parameters"
  type = object({
    cidr_block = string
    public_subnet_cidrs = list(string)
    private_subnet_cidrs = list(string)
    isolated_subnet_cidrs = list(string)
    enable_nat_gateway = bool
    enable_vpn_gateway = bool
    enable_flow_logs = bool
    flow_logs_retention_days = number
  })

  validation {
    condition     = can(cidrhost(var.vpc_config.cidr_block, 0))
    error_message = "VPC CIDR block must be a valid IPv4 CIDR notation."
  }

  validation {
    condition     = length(var.vpc_config.public_subnet_cidrs) >= 2
    error_message = "At least 2 public subnets must be defined for high availability."
  }
}

# ECS Configuration
variable "ecs_config" {
  description = "ECS cluster configuration"
  type = object({
    cluster_name = string
    capacity_providers = list(string)
    container_insights = bool
    task_cpu = number
    task_memory = number
    autoscaling = object({
      min_capacity = number
      max_capacity = number
      target_cpu_utilization = number
      target_memory_utilization = number
    })
  })

  validation {
    condition     = contains(["FARGATE", "FARGATE_SPOT"], var.ecs_config.capacity_providers[0])
    error_message = "ECS capacity providers must include FARGATE or FARGATE_SPOT."
  }
}

# Database Configuration
variable "database_config" {
  description = "Database configuration parameters"
  type = object({
    dynamodb = object({
      table_name = string
      billing_mode = string
      read_capacity = optional(number)
      write_capacity = optional(number)
      enable_encryption = bool
      enable_point_in_time_recovery = bool
    })
    aurora = object({
      cluster_identifier = string
      engine_version = string
      instance_class = string
      instances = number
      deletion_protection = bool
      backup_retention_period = number
      enable_performance_insights = bool
    })
  })

  validation {
    condition     = contains(["PAY_PER_REQUEST", "PROVISIONED"], var.database_config.dynamodb.billing_mode)
    error_message = "DynamoDB billing mode must be either PAY_PER_REQUEST or PROVISIONED."
  }
}

# Search Configuration
variable "search_config" {
  description = "OpenSearch domain configuration"
  type = object({
    domain_name = string
    engine_version = string
    instance_type = string
    instance_count = number
    zone_awareness_enabled = bool
    ebs_options = object({
      volume_type = string
      volume_size = number
      iops = optional(number)
    })
    encrypt_at_rest = bool
    node_to_node_encryption = bool
  })

  validation {
    condition     = can(regex("^OpenSearch_[0-9]\\.[0-9]+$", var.search_config.engine_version))
    error_message = "OpenSearch engine version must be valid (e.g., OpenSearch_1.3)."
  }
}

# Security Configuration
variable "security_config" {
  description = "Security-related configuration parameters"
  type = object({
    kms = object({
      deletion_window_in_days = number
      enable_key_rotation = bool
    })
    waf = object({
      ip_rate_limit = number
      rule_names = list(string)
    })
    network_acls = object({
      default_network_acl_deny_all = bool
      restricted_ports = list(number)
    })
  })

  validation {
    condition     = var.security_config.kms.deletion_window_in_days >= 7
    error_message = "KMS key deletion window must be at least 7 days."
  }
}

# Monitoring Configuration
variable "monitoring_config" {
  description = "Monitoring and logging configuration"
  type = object({
    cloudwatch = object({
      log_retention_days = number
      metric_namespaces = list(string)
    })
    alerts = object({
      cpu_utilization_threshold = number
      memory_utilization_threshold = number
      error_rate_threshold = number
      notification_email = string
    })
  })

  validation {
    condition     = contains([0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.monitoring_config.cloudwatch.log_retention_days)
    error_message = "CloudWatch log retention days must be a valid value."
  }
}

# Resource Tagging
variable "tags" {
  description = "Resource tags for cost allocation and organization"
  type        = map(string)
  
  validation {
    condition     = contains(keys(var.tags), "Environment") && contains(keys(var.tags), "Application")
    error_message = "Tags must include at least Environment and Application keys."
  }

  default = {
    Environment = "dev"
    Application = "agent-builder-hub"
    ManagedBy   = "terraform"
  }
}