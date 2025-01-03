# Provider and Terraform configuration
terraform {
  required_version = ">= 1.0.0"

  backend "s3" {
    bucket         = "agent-builder-hub-staging-tfstate"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# AWS Provider configuration
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

# Local variables
locals {
  environment = "staging"
  common_tags = {
    Environment         = "staging"
    Project            = "agent-builder-hub"
    ManagedBy          = "terraform"
    CostCenter         = "staging-ops"
    DataClassification = "internal"
    IntegrationTesting = "enabled"
  }
}

# Networking Module
module "networking" {
  source = "../../modules/networking"

  environment = local.environment
  vpc_config = {
    cidr_block               = "10.1.0.0/16"  # Staging VPC CIDR
    public_subnet_cidrs      = ["10.1.1.0/24", "10.1.2.0/24"]
    private_subnet_cidrs     = ["10.1.10.0/24", "10.1.11.0/24"]
    isolated_subnet_cidrs    = ["10.1.20.0/24", "10.1.21.0/24"]
    enable_nat_gateway       = true
    enable_vpn_gateway       = true
    enable_flow_logs        = true
    flow_logs_retention_days = 30
  }

  tags = local.common_tags
}

# Database Module
module "database" {
  source = "../../modules/database"

  environment = local.environment
  vpc_id      = module.networking.vpc_id
  subnet_ids  = module.networking.private_subnet_ids

  database_config = {
    dynamodb = {
      table_name                    = "agent-builder-hub-staging"
      billing_mode                  = "PROVISIONED"
      read_capacity                 = 50
      write_capacity                = 50
      enable_encryption             = true
      enable_point_in_time_recovery = true
    }
    aurora = {
      cluster_identifier           = "agent-builder-hub-staging"
      engine_version              = "13.7"
      instance_class              = "db.r6g.large"
      instances                   = 2
      deletion_protection         = true
      backup_retention_period     = 14
      enable_performance_insights = true
    }
  }

  search_config = {
    domain_name             = "agent-builder-hub-staging"
    engine_version         = "OpenSearch_1.3"
    instance_type          = "r6g.large.search"
    instance_count         = 2
    zone_awareness_enabled = true
    ebs_options = {
      volume_type = "gp3"
      volume_size = 100
      iops        = 3000
    }
    encrypt_at_rest        = true
    node_to_node_encryption = true
  }

  tags = local.common_tags
}

# Monitoring Module
module "monitoring" {
  source = "../../modules/monitoring"

  environment = local.environment
  
  monitoring_config = {
    cloudwatch = {
      log_retention_days  = 30
      metric_namespaces  = ["AgentBuilderHub/Staging"]
    }
    alerts = {
      cpu_utilization_threshold     = 70
      memory_utilization_threshold  = 70
      error_rate_threshold         = 5
      notification_email           = "staging-alerts@hakkoda.io"
    }
  }

  tags = local.common_tags
}

# Security Configuration
module "security" {
  source = "../../modules/security"

  environment = local.environment
  vpc_id      = module.networking.vpc_id

  security_config = {
    kms = {
      deletion_window_in_days = 14
      enable_key_rotation    = true
    }
    waf = {
      ip_rate_limit = 2000
      rule_names    = ["staging-security-rules"]
    }
    network_acls = {
      default_network_acl_deny_all = true
      restricted_ports             = [22, 3389]
    }
  }

  tags = local.common_tags
}

# Outputs
output "vpc_id" {
  description = "The ID of the staging VPC"
  value       = module.networking.vpc_id
}

output "database_endpoints" {
  description = "Database endpoints for the staging environment"
  value = {
    aurora     = module.database.aurora_cluster_endpoint
    opensearch = module.database.opensearch_endpoint
    dynamodb   = "dynamodb.${var.aws_region}.amazonaws.com"
  }
}

output "monitoring_config" {
  description = "Monitoring configuration for the staging environment"
  value = {
    log_groups    = module.monitoring.cloudwatch_log_groups
    alarm_topics  = module.monitoring.alarm_topics
  }
  sensitive = true
}