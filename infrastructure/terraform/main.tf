# Configure Terraform settings and required providers
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

  backend "s3" {
    # Backend configuration should be provided via backend config file or CLI
    key = "agent-builder-hub/terraform.tfstate"
  }
}

# Configure AWS Provider with region and default tags
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "AgentBuilderHub"
      ManagedBy   = "Terraform"
    }
  }
}

# Random string for unique resource naming
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# Core networking infrastructure
module "networking" {
  source = "./modules/networking"

  environment         = var.environment
  vpc_config         = var.vpc_config
  random_suffix      = random_string.suffix.result
}

# Compute resources (ECS, Lambda)
module "compute" {
  source = "./modules/compute"

  environment         = var.environment
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  ecs_config         = var.ecs_config
  random_suffix      = random_string.suffix.result
  kms_key_arn        = module.security.kms_key_arns["ecs"]

  depends_on = [module.networking]
}

# Database infrastructure
module "database" {
  source = "./modules/database"

  environment         = var.environment
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  database_config    = var.database_config
  kms_key_arn        = module.security.kms_key_arns["database"]
  random_suffix      = random_string.suffix.result

  depends_on = [module.networking]
}

# Search infrastructure
module "search" {
  source = "./modules/search"

  environment         = var.environment
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  search_config      = var.search_config
  kms_key_arn        = module.security.kms_key_arns["search"]
  random_suffix      = random_string.suffix.result

  depends_on = [module.networking]
}

# Security infrastructure
module "security" {
  source = "./modules/security"

  environment      = var.environment
  vpc_id          = module.networking.vpc_id
  security_config = var.security_config
  random_suffix   = random_string.suffix.result

  depends_on = [module.networking]
}

# Monitoring infrastructure
module "monitoring" {
  source = "./modules/monitoring"

  environment        = var.environment
  vpc_id            = module.networking.vpc_id
  monitoring_config = var.monitoring_config
  random_suffix     = random_string.suffix.result

  # Resource ARNs to monitor
  ecs_cluster_arn   = module.compute.ecs_cluster_id
  lambda_arns       = module.compute.lambda_function_arns
  database_arns     = module.database.dynamodb_table_arns
  opensearch_arn    = module.search.domain_arn

  depends_on = [
    module.compute,
    module.database,
    module.search
  ]
}

# Output important resource identifiers
output "vpc_id" {
  description = "ID of the created VPC"
  value       = module.networking.vpc_id
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = module.compute.ecs_cluster_id
}

output "database_endpoints" {
  description = "Database endpoints for application connectivity"
  value = {
    aurora_endpoint        = module.database.aurora_cluster_endpoint
    aurora_reader_endpoint = module.database.aurora_reader_endpoint
  }
  sensitive = true
}

output "security_config" {
  description = "Security configuration for service integration"
  value = {
    kms_key_arns    = module.security.kms_key_arns
    waf_web_acl_arn = module.security.waf_web_acl_arn
  }
}

output "monitoring_dashboard_url" {
  description = "URL of the CloudWatch monitoring dashboard"
  value       = module.monitoring.dashboard_url
}