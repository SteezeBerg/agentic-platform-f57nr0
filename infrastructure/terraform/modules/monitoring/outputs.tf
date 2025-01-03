# Application log group outputs
output "log_group_arn" {
  value       = aws_cloudwatch_log_group.application_logs.arn
  description = "ARN of the CloudWatch log group for application logs and monitoring"
}

output "log_group_name" {
  value       = aws_cloudwatch_log_group.application_logs.name
  description = "Name of the CloudWatch log group for application logs and monitoring"
}

# Dashboard outputs
output "dashboard_arn" {
  value       = aws_cloudwatch_dashboard.main.dashboard_arn
  description = "ARN of the CloudWatch dashboard for operational and performance metrics visualization"
}

# Alarm notification outputs
output "alarm_topic_arn" {
  value       = aws_sns_topic.monitoring_alerts.arn
  description = "ARN of the SNS topic for CloudWatch alarm notifications"
}

# Metric alarm outputs
output "metric_alarms" {
  value = {
    api_latency         = aws_cloudwatch_metric_alarm.api_latency.arn
    error_rate         = aws_cloudwatch_metric_alarm.error_rate.arn
    cpu_utilization    = aws_cloudwatch_metric_alarm.cpu_utilization.arn
    memory_utilization = aws_cloudwatch_metric_alarm.memory_utilization.arn
  }
  description = "Map of CloudWatch alarm ARNs for monitoring system performance and health metrics"
}

# X-Ray tracing outputs
output "xray_sampling_rule_arn" {
  value       = aws_xray_sampling_rule.api_sampling.arn
  description = "ARN of the X-Ray sampling rule for API request tracing configuration"
}

# Log metric filter outputs
output "error_log_metric_filter" {
  value       = aws_cloudwatch_log_metric_filter.error_logs.id
  description = "ID of the CloudWatch log metric filter for error tracking"
}

# SNS topic subscription outputs
output "alarm_subscriptions" {
  value = {
    for subscription in aws_sns_topic_subscription.email_alerts : subscription.endpoint => subscription.arn
  }
  description = "Map of email endpoints to their corresponding SNS topic subscription ARNs"
}

# Dashboard URL output
output "dashboard_url" {
  value       = "https://${data.aws_region.current.name}.console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
  description = "URL of the CloudWatch dashboard for monitoring visualization"
}

# Resource naming outputs
output "resource_prefix" {
  value       = local.name_prefix
  description = "Resource naming prefix used across monitoring infrastructure"
}

# Metric namespace outputs
output "error_metrics_namespace" {
  value       = "${local.name_prefix}/Errors"
  description = "CloudWatch metrics namespace for error tracking"
}