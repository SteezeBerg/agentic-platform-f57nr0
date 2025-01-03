# Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for common resource configuration
locals {
  common_tags = merge(var.tags, {
    Environment      = var.environment
    Project         = var.project_name
    ComplianceScope = "SOC2-GDPR-HIPAA-ISO27001"
    ManagedBy       = "terraform"
  })
  
  name_prefix = "${var.project_name}-${var.environment}"
}

# Cognito User Pool with advanced security features
resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-user-pool"
  
  # MFA Configuration
  mfa_configuration = var.cognito_config.mfa_configuration
  
  # Password Policy
  password_policy {
    minimum_length    = var.cognito_config.password_policy.minimum_length
    require_lowercase = var.cognito_config.password_policy.require_lowercase
    require_numbers   = var.cognito_config.password_policy.require_numbers
    require_symbols   = var.cognito_config.password_policy.require_symbols
    require_uppercase = var.cognito_config.password_policy.require_uppercase
  }
  
  # Advanced Security Features
  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }
  
  # Email Verification
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }
  
  # Account Recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
  
  tags = local.common_tags
}

# KMS Key for encryption
resource "aws_kms_key" "main" {
  description             = "KMS key for ${local.name_prefix} encryption"
  deletion_window_in_days = var.kms_config.deletion_window_in_days
  enable_key_rotation     = var.kms_config.enable_key_rotation
  key_usage              = var.kms_config.key_usage
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = concat(
            ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"],
            var.kms_config.key_administrators
          )
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Key Users"
        Effect = "Allow"
        Principal = {
          AWS = var.kms_config.key_users
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })
  
  tags = local.common_tags
}

# WAF Web ACL
resource "aws_wafv2_web_acl" "main" {
  name        = "${local.name_prefix}-web-acl"
  description = "WAF Web ACL for ${local.name_prefix}"
  scope       = "REGIONAL"
  
  default_action {
    allow {}
  }
  
  dynamic "rule" {
    for_each = var.waf_rules
    content {
      name     = rule.value.name
      priority = rule.value.priority
      
      override_action {
        none {}
      }
      
      statement {
        dynamic "rate_based_statement" {
          for_each = rule.value.rule_type == "rate-based" ? [1] : []
          content {
            limit              = rule.value.ip_rate_limit
            aggregate_key_type = "IP"
          }
        }
        
        dynamic "ip_set_reference_statement" {
          for_each = rule.value.rule_type == "ip-blacklist" ? [1] : []
          content {
            arn = aws_wafv2_ip_set.blocked_ips[0].arn
          }
        }
      }
      
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name               = "${rule.value.name}-metric"
        sampled_requests_enabled  = true
      }
    }
  }
  
  tags = local.common_tags
}

# Security Group
resource "aws_security_group" "main" {
  name        = "${local.name_prefix}-security-group"
  description = "Security group for ${local.name_prefix}"
  vpc_id      = var.vpc_id
  
  dynamic "ingress" {
    for_each = var.security_groups[0].ingress_rules
    content {
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
      description = ingress.value.description
    }
  }
  
  dynamic "egress" {
    for_each = var.security_groups[0].egress_rules
    content {
      from_port   = egress.value.from_port
      to_port     = egress.value.to_port
      protocol    = egress.value.protocol
      cidr_blocks = egress.value.cidr_blocks
      description = egress.value.description
    }
  }
  
  tags = local.common_tags
}

# GuardDuty Detector
resource "aws_guardduty_detector" "main" {
  enable = var.monitoring_config.enable_guardduty
  
  finding_publishing_frequency = "FIFTEEN_MINUTES"
  
  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }
}

# Security Hub
resource "aws_securityhub_account" "main" {
  count = var.monitoring_config.enable_security_hub ? 1 : 0
  
  enable_default_standards = true
  
  control_finding_generator = "SECURITY_CONTROL"
  
  auto_enable_controls = true
}

# CloudTrail
resource "aws_cloudtrail" "main" {
  count = var.monitoring_config.enable_cloudtrail ? 1 : 0
  
  name                          = "${local.name_prefix}-trail"
  s3_bucket_name               = aws_s3_bucket.cloudtrail_logs.id
  include_global_service_events = true
  is_multi_region_trail        = true
  enable_logging               = true
  kms_key_id                  = aws_kms_key.main.arn
  
  event_selector {
    read_write_type           = "All"
    include_management_events = true
    
    data_resource {
      type   = "AWS::S3::Object"
      values = ["arn:aws:s3:::"]
    }
  }
  
  cloud_watch_logs_group_arn = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn  = aws_iam_role.cloudtrail_cloudwatch.arn
  
  tags = local.common_tags
}

# CloudWatch Log Group for CloudTrail
resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = "/aws/cloudtrail/${local.name_prefix}"
  retention_in_days = var.monitoring_config.cloudtrail_retention_days
  kms_key_id       = aws_kms_key.main.arn
  
  tags = local.common_tags
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Outputs
output "cognito_user_pool_id" {
  value       = aws_cognito_user_pool.main.id
  description = "ID of the Cognito User Pool"
}

output "cognito_user_pool_arn" {
  value       = aws_cognito_user_pool.main.arn
  description = "ARN of the Cognito User Pool"
}

output "kms_key_id" {
  value       = aws_kms_key.main.key_id
  description = "ID of the KMS key"
}

output "kms_key_arn" {
  value       = aws_kms_key.main.arn
  description = "ARN of the KMS key"
}

output "waf_web_acl_id" {
  value       = aws_wafv2_web_acl.main.id
  description = "ID of the WAF Web ACL"
}

output "security_group_id" {
  value       = aws_security_group.main.id
  description = "ID of the security group"
}

output "guardduty_detector_id" {
  value       = aws_guardduty_detector.main.id
  description = "ID of the GuardDuty detector"
}

output "cloudtrail_arn" {
  value       = var.monitoring_config.enable_cloudtrail ? aws_cloudtrail.main[0].arn : null
  description = "ARN of the CloudTrail trail"
}