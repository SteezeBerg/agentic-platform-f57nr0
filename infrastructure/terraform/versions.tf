# Terraform version constraint
terraform {
  # Minimum required version of Terraform Core
  # Ensures consistent behavior across environments
  # Version 1.0.0+ includes important security fixes and stable provider protocol
  required_version = ">=1.0.0"

  # Required provider configurations with version constraints
  required_providers {
    # AWS provider for infrastructure deployment
    # Version 5.x includes enhanced security features and multi-account support
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }

    # Random provider for generating unique identifiers
    # Version 3.x provides improved randomization algorithms
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}