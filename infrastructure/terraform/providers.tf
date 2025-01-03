# AWS Provider configuration with enhanced security and compliance settings
provider "aws" {
  region = var.aws_region
  
  # Restrict to specific account IDs for security
  allowed_account_ids = [var.account_id]
  
  # Enhanced retry configuration for API stability
  max_retries = 3
  
  # Assume IAM role for provider execution
  assume_role {
    role_arn     = "arn:aws:iam::${var.account_id}:role/TerraformExecutionRole"
    session_name = "TerraformProviderSession-${var.environment}"
    external_id  = "AgentBuilderHub-${var.environment}"
  }

  # Default tags applied to all resources
  default_tags {
    tags = {
      Environment         = var.environment
      Project            = "AgentBuilderHub"
      ManagedBy         = "Terraform"
      SecurityCompliance = "SOC2"
      DataClassification = "Confidential"
      CostCenter        = "Engineering"
      LastUpdated       = timestamp()
    }
  }
}

# Additional AWS provider for security-specific resources
provider "aws" {
  alias  = "security"
  region = var.aws_region
  
  # Enhanced security settings for security-related resources
  max_retries = 3
  
  assume_role {
    role_arn     = "arn:aws:iam::${var.account_id}:role/SecurityAdminRole"
    session_name = "SecurityProviderSession-${var.environment}"
    external_id  = "SecurityAdmin-${var.environment}"
  }
}

# Random provider for secure resource naming
provider "random" {
  # Random provider doesn't require specific configuration
  # Used for generating secure random values for resource names
}

# Configure AWS provider for KMS operations
provider "aws" {
  alias  = "kms"
  region = var.aws_region
  
  assume_role {
    role_arn     = "arn:aws:iam::${var.account_id}:role/KMSAdminRole"
    session_name = "KMSProviderSession-${var.environment}"
    external_id  = "KMSAdmin-${var.environment}"
  }
}

# Configure AWS provider for network operations
provider "aws" {
  alias  = "network"
  region = var.aws_region
  
  assume_role {
    role_arn     = "arn:aws:iam::${var.account_id}:role/NetworkAdminRole"
    session_name = "NetworkProviderSession-${var.environment}"
    external_id  = "NetworkAdmin-${var.environment}"
  }
}

# Configure AWS provider for logging operations
provider "aws" {
  alias  = "logging"
  region = var.aws_region
  
  assume_role {
    role_arn     = "arn:aws:iam::${var.account_id}:role/LoggingAdminRole"
    session_name = "LoggingProviderSession-${var.environment}"
    external_id  = "LoggingAdmin-${var.environment}"
  }
}

# Configure AWS provider for backup operations
provider "aws" {
  alias  = "backup"
  region = var.aws_region
  
  assume_role {
    role_arn     = "arn:aws:iam::${var.account_id}:role/BackupAdminRole"
    session_name = "BackupProviderSession-${var.environment}"
    external_id  = "BackupAdmin-${var.environment}"
  }
}