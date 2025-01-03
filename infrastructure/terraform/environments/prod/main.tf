# Production environment Terraform configuration for Agent Builder Hub
# Version: 1.0.0

terraform {
  required_version = ">= 1.0.0"

  backend "s3" {
    bucket         = "agent-builder-hub-prod-tfstate"
    key            = "prod/terraform.tfstate"
    region         = "us-west-2"
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

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.tags
  }
}

# Random suffix for unique resource naming
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# Networking module for production VPC and subnets
module "networking" {
  source = "../../../modules/networking"

  environment         = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  enable_nat_gateway = var.enable_nat_gateway

  flow_logs_config = {
    retention_days = var.cloudwatch_retention_days
    traffic_type   = "ALL"
  }

  tags = merge(var.tags, {
    Module = "networking"
  })
}

# Compute resources for production workloads
module "compute" {
  source = "../../../modules/compute"

  environment      = var.environment
  vpc_id          = module.networking.vpc_id
  subnet_ids      = module.networking.private_subnet_ids
  cluster_name    = var.ecs_cluster_name
  enable_spot     = var.enable_spot_capacity

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  
  auto_scaling_config = {
    min_capacity = 2
    max_capacity = 10
    target_cpu_utilization = 70
    target_memory_utilization = 80
  }

  depends_on = [module.networking]

  tags = merge(var.tags, {
    Module = "compute"
  })
}

# Database resources with multi-AZ deployment
module "database" {
  source = "../../../modules/database"

  environment = var.environment
  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.isolated_subnet_ids

  aurora_config = {
    cluster_name           = var.aurora_cluster_name
    engine_version        = "13.7"
    instance_class        = "db.r6g.large"
    instances            = 3
    multi_az             = true
    backup_retention     = 35
    deletion_protection  = true
  }

  dynamodb_tables = var.dynamodb_table_names

  opensearch_config = {
    domain_name         = var.opensearch_domain_name
    instance_type      = "r6g.large.search"
    instance_count     = 3
    zone_awareness     = true
    volume_size        = 100
    master_node_count  = 3
  }

  depends_on = [module.networking]

  tags = merge(var.tags, {
    Module = "database"
  })
}

# Enhanced security controls for production
module "security" {
  source = "../../../modules/security"

  environment = var.environment
  vpc_id     = module.networking.vpc_id

  kms_config = {
    deletion_window = 30
    key_rotation   = true
  }

  waf_config = {
    ip_rate_limit = 2000
    rules = [
      "AWSManagedRulesCommonRuleSet",
      "AWSManagedRulesKnownBadInputsRuleSet",
      "AWSManagedRulesAmazonIpReputationList"
    ]
  }

  security_group_rules = {
    ingress = [
      {
        from_port   = 443
        to_port     = 443
        protocol    = "tcp"
        cidr_blocks = [var.vpc_cidr]
      }
    ]
  }

  depends_on = [module.networking]

  tags = merge(var.tags, {
    Module = "security"
  })
}

# Comprehensive production monitoring
module "monitoring" {
  source = "../../../modules/monitoring"

  environment = var.environment
  vpc_id     = module.networking.vpc_id

  cloudwatch_config = {
    retention_days     = var.cloudwatch_retention_days
    log_group_prefix  = "/aws/agent-builder-hub/prod"
  }

  alarm_config = {
    cpu_threshold    = 80
    memory_threshold = 80
    error_threshold  = 5
    evaluation_periods = 3
  }

  performance_insights = {
    retention_period = 7
    enabled         = true
  }

  depends_on = [
    module.compute,
    module.database
  ]

  tags = merge(var.tags, {
    Module = "monitoring"
  })
}

# Production environment outputs
output "vpc_id" {
  description = "Production VPC ID"
  value       = module.networking.vpc_id
}

output "ecs_cluster_arn" {
  description = "Production ECS Cluster ARN"
  value       = module.compute.ecs_cluster_id
}

output "database_endpoints" {
  description = "Production database endpoints"
  value = {
    aurora_endpoint        = module.database.aurora_cluster_endpoint
    read_replica_endpoints = module.database.read_replica_endpoints
    opensearch_endpoint    = module.database.opensearch_endpoint
  }
  sensitive = true
}

output "security_config" {
  description = "Production security configuration"
  value = {
    kms_key_arn     = module.security.kms_key_arn
    waf_web_acl_arn = module.security.waf_web_acl_arn
  }
}