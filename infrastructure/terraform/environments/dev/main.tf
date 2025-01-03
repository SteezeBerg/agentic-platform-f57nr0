# Provider and terraform configuration
terraform {
  required_version = ">= 1.0.0"
  
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
    tags = {
      Environment = "dev"
      Project     = "agent-builder-hub"
      ManagedBy   = "terraform"
    }
  }
}

# Local variables
locals {
  environment         = "dev"
  retention_days     = 7
  backup_retention_days = 3
  enable_spot_instances = true
  
  name_prefix = "agent-builder-hub-${local.environment}"
  
  vpc_cidr = "10.0.0.0/16"
  availability_zones = ["us-west-2a", "us-west-2b"]
  
  public_subnet_cidrs = ["10.0.0.0/24", "10.0.1.0/24"]
  private_subnet_cidrs = ["10.0.2.0/24", "10.0.3.0/24"]
  isolated_subnet_cidrs = ["10.0.4.0/24", "10.0.5.0/24"]
}

# Networking module
module "networking" {
  source = "../../modules/networking"
  
  vpc_cidr = local.vpc_cidr
  environment = local.environment
  availability_zones = local.availability_zones
  public_subnet_cidrs = local.public_subnet_cidrs
  private_subnet_cidrs = local.private_subnet_cidrs
  isolated_subnet_cidrs = local.isolated_subnet_cidrs
  
  enable_nat_gateway = true
  enable_vpn_gateway = false
  
  tags = {
    Environment = local.environment
    Project     = "agent-builder-hub"
  }
}

# Security module
module "security" {
  source = "../../modules/security"
  
  project_name = "agent-builder-hub"
  environment  = local.environment
  vpc_id       = module.networking.vpc_id
  
  cognito_config = {
    user_pool_name = "${local.name_prefix}-users"
    email_verification_required = true
    mfa_configuration = "OPTIONAL"
    password_policy = {
      minimum_length    = 12
      require_lowercase = true
      require_numbers   = true
      require_symbols   = true
      require_uppercase = true
    }
    allowed_oauth_flows = ["code"]
    allowed_oauth_scopes = ["email", "openid", "profile"]
    callback_urls = ["http://localhost:3000"]
    identity_providers = ["COGNITO"]
    user_groups = [
      {
        name = "developers"
        description = "Development team members"
        precedence = 1
      }
    ]
  }
  
  kms_config = {
    deletion_window_in_days = 7
    enable_key_rotation    = true
    key_usage             = "ENCRYPT_DECRYPT"
    alias_name            = "${local.name_prefix}-key"
    key_administrators    = []
    key_users            = []
    encrypted_resources   = ["*"]
  }
  
  waf_rules = [
    {
      name = "RateLimit"
      priority = 1
      rule_type = "rate-based"
      action = "block"
      ip_rate_limit = 2000
    },
    {
      name = "SQLInjectionProtection"
      priority = 2
      rule_type = "managed"
      action = "block"
      sql_injection_protection = true
    }
  ]
  
  security_groups = [
    {
      name = "ecs-tasks"
      description = "Security group for ECS tasks"
      ingress_rules = [
        {
          from_port   = 80
          to_port     = 80
          protocol    = "tcp"
          cidr_blocks = ["0.0.0.0/0"]
          description = "HTTP inbound"
        }
      ]
      egress_rules = [
        {
          from_port   = 0
          to_port     = 0
          protocol    = "-1"
          cidr_blocks = ["0.0.0.0/0"]
          description = "All outbound"
        }
      ]
    }
  ]
  
  monitoring_config = {
    enable_guardduty = true
    enable_security_hub = true
    enable_cloudtrail = true
    cloudtrail_retention_days = local.retention_days
    alert_email_endpoints = []
    metric_filters = []
    finding_aggregation_region = var.aws_region
  }
  
  compliance_config = {
    enable_config_recorder = true
    config_recording_group = ["*"]
    enable_aws_config_rules = true
    compliance_rules = []
    audit_log_retention_days = local.retention_days
    enable_access_analyzer = true
  }
}

# Outputs
output "vpc_id" {
  value = module.networking.vpc_id
  description = "ID of the development VPC"
}

output "ecs_cluster_arn" {
  value = aws_ecs_cluster.main.arn
  description = "ARN of the development ECS cluster"
}

output "database_endpoint" {
  value = aws_rds_cluster.main.endpoint
  description = "Endpoint of the development Aurora PostgreSQL cluster"
}

output "opensearch_endpoint" {
  value = aws_opensearch_domain.main.endpoint
  description = "Endpoint of the development OpenSearch domain"
}

output "cloudwatch_log_group" {
  value = aws_cloudwatch_log_group.main.name
  description = "Name of the CloudWatch log group for development environment"
}