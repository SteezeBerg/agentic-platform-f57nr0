# Output values for Cognito User Pool
output "cognito_user_pool_id" {
  value       = aws_cognito_user_pool.main.id
  description = "ID of the Cognito User Pool for authentication service integration"
  sensitive   = false
}

output "cognito_user_pool_arn" {
  value       = aws_cognito_user_pool.main.arn
  description = "ARN of the Cognito User Pool for IAM policy attachment and service integration"
  sensitive   = false
}

# Output values for KMS encryption
output "kms_key_id" {
  value       = aws_kms_key.main.id
  description = "ID of the KMS key for data encryption configuration"
  sensitive   = true
}

output "kms_key_arn" {
  value       = aws_kms_key.main.arn
  description = "ARN of the KMS key for key policy configuration and cross-service encryption"
  sensitive   = true
}

# Output values for WAF Web ACL
output "waf_web_acl_id" {
  value       = aws_wafv2_web_acl.main.id
  description = "ID of the WAF Web ACL for ALB and API Gateway association"
  sensitive   = false
}

output "waf_web_acl_arn" {
  value       = aws_wafv2_web_acl.main.arn
  description = "ARN of the WAF Web ACL for CloudFront distribution association"
  sensitive   = false
}

# Output values for Security Group
output "security_group_id" {
  value       = aws_security_group.main.id
  description = "ID of the security group for EC2, ECS tasks and RDS instance association"
  sensitive   = false
}

# Output values for Security Monitoring
output "guardduty_detector_id" {
  value       = aws_guardduty_detector.main.id
  description = "ID of the GuardDuty detector for threat detection monitoring"
  sensitive   = false
}

output "security_hub_account_id" {
  value       = var.monitoring_config.enable_security_hub ? aws_securityhub_account.main[0].id : null
  description = "ID of the Security Hub account for security findings aggregation"
  sensitive   = false
}

output "cloudtrail_arn" {
  value       = var.monitoring_config.enable_cloudtrail ? aws_cloudtrail.main[0].arn : null
  description = "ARN of the CloudTrail trail for API activity monitoring"
  sensitive   = false
}

output "cloudwatch_log_group_arn" {
  value       = aws_cloudwatch_log_group.cloudtrail.arn
  description = "ARN of the CloudWatch Log Group for CloudTrail logs"
  sensitive   = false
}