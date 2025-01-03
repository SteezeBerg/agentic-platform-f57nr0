# AWS Provider version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  name_prefix = "${var.project}-${var.environment}"
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "application_logs" {
  name              = "/aws/${local.name_prefix}/application"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# SNS Topic for Alarm Notifications
resource "aws_sns_topic" "monitoring_alerts" {
  name = "${local.name_prefix}-monitoring-alerts"
  tags = local.common_tags
}

# SNS Topic Email Subscriptions
resource "aws_sns_topic_subscription" "email_alerts" {
  for_each  = toset(var.alarm_email_endpoints)
  topic_arn = aws_sns_topic.monitoring_alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

# API Latency Alarm
resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "${local.name_prefix}-api-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name        = "Latency"
  namespace          = "AWS/ApiGateway"
  period             = 60
  statistic          = "Average"
  threshold          = var.api_latency_threshold
  alarm_description  = "API Gateway latency is above threshold"
  alarm_actions      = [aws_sns_topic.monitoring_alerts.arn]
  ok_actions         = [aws_sns_topic.monitoring_alerts.arn]
  
  dimensions = {
    ApiName = "${local.name_prefix}-api"
  }
  
  tags = local.common_tags
}

# Error Rate Alarm
resource "aws_cloudwatch_metric_alarm" "error_rate" {
  alarm_name          = "${local.name_prefix}-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name        = "5XXError"
  namespace          = "AWS/ApiGateway"
  period             = 300
  statistic          = "Average"
  threshold          = var.error_rate_threshold
  alarm_description  = "API error rate is above threshold"
  alarm_actions      = [aws_sns_topic.monitoring_alerts.arn]
  ok_actions         = [aws_sns_topic.monitoring_alerts.arn]
  
  tags = local.common_tags
}

# CPU Utilization Alarm
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  alarm_name          = "${local.name_prefix}-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name        = "CPUUtilization"
  namespace          = "AWS/ECS"
  period             = 300
  statistic          = "Average"
  threshold          = var.cpu_utilization_threshold
  alarm_description  = "Container CPU utilization is above threshold"
  alarm_actions      = [aws_sns_topic.monitoring_alerts.arn]
  ok_actions         = [aws_sns_topic.monitoring_alerts.arn]
  
  dimensions = {
    ClusterName = "${local.name_prefix}-cluster"
  }
  
  tags = local.common_tags
}

# Memory Utilization Alarm
resource "aws_cloudwatch_metric_alarm" "memory_utilization" {
  alarm_name          = "${local.name_prefix}-memory-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name        = "MemoryUtilization"
  namespace          = "AWS/ECS"
  period             = 300
  statistic          = "Average"
  threshold          = var.memory_utilization_threshold
  alarm_description  = "Container memory utilization is above threshold"
  alarm_actions      = [aws_sns_topic.monitoring_alerts.arn]
  ok_actions         = [aws_sns_topic.monitoring_alerts.arn]
  
  dimensions = {
    ClusterName = "${local.name_prefix}-cluster"
  }
  
  tags = local.common_tags
}

# X-Ray Sampling Rule
resource "aws_xray_sampling_rule" "api_sampling" {
  rule_name      = "${local.name_prefix}-api-sampling"
  priority       = 1
  reservoir_size = 1
  fixed_rate     = var.xray_sampling_rate / 100
  host           = "*"
  http_method    = "*"
  service_name   = "*"
  service_type   = "*"
  url_path       = "/api/*"
  version        = 1
}

# Log Metric Filters
resource "aws_cloudwatch_log_metric_filter" "error_logs" {
  name           = "${local.name_prefix}-error-logs"
  pattern        = "[timestamp, requestid, level = ERROR, message]"
  log_group_name = aws_cloudwatch_log_group.application_logs.name

  metric_transformation {
    name          = "ErrorCount"
    namespace     = "${local.name_prefix}/Errors"
    value         = "1"
    default_value = "0"
  }
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name_prefix}-dashboard"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ApiGateway", "Latency", "ApiName", "${local.name_prefix}-api"]
          ]
          period = 60
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "API Latency"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ApiGateway", "5XXError", "ApiName", "${local.name_prefix}-api"]
          ]
          period = 60
          stat   = "Sum"
          region = data.aws_region.current.name
          title  = "API Errors"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", "${local.name_prefix}-cluster"]
          ]
          period = 300
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "CPU Utilization"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ECS", "MemoryUtilization", "ClusterName", "${local.name_prefix}-cluster"]
          ]
          period = 300
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "Memory Utilization"
        }
      }
    ]
  })
}

# Data source for current AWS region
data "aws_region" "current" {}