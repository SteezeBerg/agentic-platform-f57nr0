# Backend configuration for Agent Builder Hub Terraform state management
# Version: AWS Provider ~> 5.0
# Purpose: Manages Terraform state with enterprise-grade security and access controls

terraform {
  backend "s3" {
    # State storage bucket with environment-specific paths
    bucket = "agent-builder-hub-terraform-state"
    key    = "${var.environment}/terraform.tfstate"
    region = "${var.aws_region}"

    # Enable encryption and versioning for state security
    encrypt        = true
    kms_key_id    = "alias/terraform-state-key"

    # Enable versioning for state history and recovery
    versioning     = true

    # State locking using DynamoDB
    dynamodb_table = "agent-builder-hub-terraform-locks"

    # Access logging configuration for audit trail
    access_logging {
      target_bucket = "agent-builder-hub-access-logs"
      target_prefix = "terraform-state/"
    }

    # Force SSL for state access
    force_ssl = true

    # Lifecycle rules for state management
    lifecycle_rules = [
      {
        enabled = true
        noncurrent_version_expiration = {
          days = 90
        }
        noncurrent_version_transition = {
          days          = 30
          storage_class = "STANDARD_IA"
        }
      }
    ]
  }

  # Required provider configuration
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Backend configuration validation
locals {
  backend_validation = {
    environment_valid = contains(["dev", "staging", "prod"], var.environment)
    region_valid     = can(regex("^(us|eu|ap|sa|ca|me|af)-(north|south|east|west|central)-[1-9]$", var.aws_region))
  }
}

# Ensure backend validation passes
resource "null_resource" "backend_validation" {
  lifecycle {
    precondition {
      condition     = local.backend_validation.environment_valid
      error_message = "Invalid environment specified. Must be one of: dev, staging, prod"
    }

    precondition {
      condition     = local.backend_validation.region_valid
      error_message = "Invalid AWS region specified"
    }
  }
}