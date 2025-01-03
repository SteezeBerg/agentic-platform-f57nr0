# ECS Cluster Outputs
output "ecs_cluster_id" {
  description = "ID of the ECS cluster for service deployments and management"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster for IAM policies and cross-account access"
  value       = aws_ecs_cluster.main.arn
}

# ECS Service Outputs
output "agent_service_id" {
  description = "ID of the agent service for deployment and scaling operations"
  value       = aws_ecs_service.agent_service.id
}

output "api_service_id" {
  description = "ID of the API service for deployment and scaling operations"
  value       = aws_ecs_service.api_service.id
}

output "web_service_id" {
  description = "ID of the web service for deployment and scaling operations"
  value       = aws_ecs_service.web_service.id
}

# Service Names Map
output "service_names" {
  description = "Map of service names for monitoring and logging configuration"
  value = {
    agent = aws_ecs_service.agent_service.name
    api   = aws_ecs_service.api_service.name
    web   = aws_ecs_service.web_service.name
  }
}

# Lambda Function Outputs
output "lambda_function_arns" {
  description = "Map of Lambda function ARNs for event source mappings and permissions"
  value = {
    builder_service     = aws_lambda_function.builder_service.arn
    knowledge_service   = aws_lambda_function.knowledge_service.arn
    orchestrator       = aws_lambda_function.orchestrator.arn
  }
}

output "lambda_function_names" {
  description = "Map of Lambda function names for CloudWatch logging and monitoring"
  value = {
    builder_service     = aws_lambda_function.builder_service.function_name
    knowledge_service   = aws_lambda_function.knowledge_service.function_name
    orchestrator       = aws_lambda_function.orchestrator.function_name
  }
}

output "lambda_qualified_arns" {
  description = "Map of Lambda qualified ARNs for version-specific operations"
  value = {
    builder_service     = aws_lambda_function.builder_service.qualified_arn
    knowledge_service   = aws_lambda_function.knowledge_service.qualified_arn
    orchestrator       = aws_lambda_function.orchestrator.qualified_arn
  }
}

# Service Discovery Outputs
output "service_discovery_namespace" {
  description = "Service discovery namespace for internal service communication"
  value       = aws_service_discovery_private_dns_namespace.main.name
}

output "service_discovery_endpoints" {
  description = "Map of service discovery endpoints for internal routing"
  value = {
    agent = "${aws_service_discovery_service.agent_service.name}.${aws_service_discovery_private_dns_namespace.main.name}"
    api   = "${aws_service_discovery_service.api_service.name}.${aws_service_discovery_private_dns_namespace.main.name}"
  }
}

# Auto Scaling Outputs
output "autoscaling_target_ids" {
  description = "Map of auto scaling target IDs for scaling policy management"
  value = {
    agent_service = aws_appautoscaling_target.agent_service.resource_id
  }
}