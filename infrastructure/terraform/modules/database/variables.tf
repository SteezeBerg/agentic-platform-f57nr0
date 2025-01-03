# Environment configuration
variable "environment" {
  description = "Deployment environment (dev/staging/prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Network configuration
variable "vpc_id" {
  description = "VPC ID where database resources will be deployed"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for database resources"
  type        = list(string)
}

# DynamoDB configuration
variable "dynamodb_config" {
  description = "DynamoDB configuration parameters"
  type = map(object({
    table_name                    = string
    billing_mode                  = string
    read_capacity                 = optional(number)
    write_capacity               = optional(number)
    stream_enabled               = bool
    stream_view_type             = optional(string)
    point_in_time_recovery       = bool
    ttl_enabled                  = bool
    ttl_attribute_name           = optional(string)
    autoscaling = optional(object({
      min_capacity               = number
      max_capacity               = number
      target_utilization        = number
    }))
    global_secondary_indexes     = optional(map(object({
      hash_key                   = string
      range_key                  = optional(string)
      projection_type           = string
      non_key_attributes        = optional(list(string))
    })))
  }))
}

# Aurora PostgreSQL configuration
variable "aurora_config" {
  description = "Aurora PostgreSQL configuration parameters"
  type = object({
    cluster_identifier           = string
    engine_version              = string
    instance_class              = string
    instances                   = number
    master_username             = string
    database_name               = string
    port                        = optional(number, 5432)
    backup_retention_period     = number
    preferred_backup_window     = string
    deletion_protection         = bool
    skip_final_snapshot        = bool
    performance_insights_enabled = bool
    auto_minor_version_upgrade  = bool
    monitoring_interval         = number
    serverless = optional(object({
      min_capacity              = number
      max_capacity             = number
      auto_pause               = bool
      seconds_until_auto_pause = number
    }))
  })
}

# OpenSearch configuration
variable "opensearch_config" {
  description = "OpenSearch domain configuration parameters"
  type = object({
    domain_name                 = string
    engine_version             = string
    instance_type              = string
    instance_count             = number
    dedicated_master_enabled   = bool
    dedicated_master_type      = optional(string)
    dedicated_master_count     = optional(number)
    zone_awareness_enabled     = bool
    availability_zone_count    = optional(number, 2)
    ebs_options = object({
      volume_type              = string
      volume_size             = number
      iops                    = optional(number)
    })
    advanced_options = optional(map(string))
    access_policies           = string
    log_publishing_options = optional(map(object({
      enabled                 = bool
      log_type               = string
      cloudwatch_log_group_name = string
    })))
  })
}

# Redis configuration
variable "redis_config" {
  description = "Redis cluster configuration parameters"
  type = object({
    cluster_id                  = string
    node_type                  = string
    num_cache_clusters         = number
    parameter_group_family     = string
    engine_version            = string
    port                      = optional(number, 6379)
    automatic_failover_enabled = bool
    multi_az_enabled          = bool
    snapshot_retention_limit   = number
    snapshot_window           = string
    maintenance_window        = string
    notification_topic_arn    = optional(string)
    preferred_cache_cluster_azs = optional(list(string))
  })
}

# Encryption configuration
variable "encryption_config" {
  description = "Encryption configuration for database services"
  type = object({
    kms_key_id                = string
    enable_at_rest           = bool
    enable_in_transit        = bool
    ssl_enforcement          = bool
    certificate_rotation_enabled = bool
    audit_logging_enabled    = bool
  })
}

# Monitoring configuration
variable "monitoring_config" {
  description = "Monitoring and alerting configuration"
  type = object({
    metrics_enabled          = bool
    enhanced_monitoring_role_arn = optional(string)
    log_retention_days      = number
    alarm_cpu_threshold     = number
    alarm_memory_threshold  = number
    alarm_storage_threshold = number
    alarm_iops_threshold    = number
    alarm_latency_threshold = number
    alarm_actions          = list(string)
    ok_actions            = list(string)
  })
}

# Maintenance window configuration
variable "maintenance_window_config" {
  description = "Maintenance and backup window configuration"
  type = object({
    backup_window           = string
    maintenance_window     = string
    apply_immediately      = bool
    auto_minor_version_upgrade = bool
    allow_major_version_upgrade = bool
  })
}

# Resource tagging
variable "tags" {
  description = "Resource tags for cost allocation and organization"
  type        = map(string)
  default = {
    Environment = "dev"
    Application = "agent-builder-hub"
    ManagedBy   = "terraform"
    Component   = "database"
  }
}