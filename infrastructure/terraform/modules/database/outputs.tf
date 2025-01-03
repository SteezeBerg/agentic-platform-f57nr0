# DynamoDB table outputs
output "dynamodb_table_arns" {
  description = "Map of DynamoDB table ARNs for IAM permissions and cross-stack references"
  value = {
    agent_config       = aws_dynamodb_table.agent_config.arn
    user_data         = aws_dynamodb_table.user_data.arn
    deployment_metrics = aws_dynamodb_table.deployment_metrics.arn
    knowledge_index    = aws_dynamodb_table.knowledge_index.arn
  }
}

output "dynamodb_stream_arns" {
  description = "Map of DynamoDB stream ARNs for event processing"
  value = {
    agent_config       = aws_dynamodb_table.agent_config.stream_arn
    user_data         = aws_dynamodb_table.user_data.stream_arn
    deployment_metrics = aws_dynamodb_table.deployment_metrics.stream_arn
    knowledge_index    = aws_dynamodb_table.knowledge_index.stream_arn
  }
}

output "dynamodb_table_names" {
  description = "Map of DynamoDB table names for application configuration"
  value = {
    agent_config       = aws_dynamodb_table.agent_config.name
    user_data         = aws_dynamodb_table.user_data.name
    deployment_metrics = aws_dynamodb_table.deployment_metrics.name
    knowledge_index    = aws_dynamodb_table.knowledge_index.name
  }
}

# Aurora PostgreSQL outputs
output "aurora_cluster_endpoint" {
  description = "Primary endpoint for Aurora PostgreSQL cluster connections"
  value       = aws_rds_cluster.main.endpoint
}

output "aurora_reader_endpoint" {
  description = "Reader endpoint for Aurora PostgreSQL read replicas"
  value       = aws_rds_cluster.main.reader_endpoint
}

output "aurora_cluster_id" {
  description = "Aurora cluster identifier for monitoring and maintenance"
  value       = aws_rds_cluster.main.cluster_identifier
}

output "aurora_port" {
  description = "Port number for Aurora PostgreSQL connections"
  value       = aws_rds_cluster.main.port
}

# OpenSearch outputs
output "opensearch_endpoint" {
  description = "Endpoint for OpenSearch domain access"
  value       = aws_opensearch_domain.main.endpoint
}

output "opensearch_domain_arn" {
  description = "OpenSearch domain ARN for IAM permissions"
  value       = aws_opensearch_domain.main.arn
}

output "opensearch_domain_name" {
  description = "OpenSearch domain name for service configuration"
  value       = aws_opensearch_domain.main.domain_name
}

# Redis outputs
output "redis_endpoint" {
  description = "Primary endpoint for Redis cluster access"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "Reader endpoint for Redis read replicas"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "redis_port" {
  description = "Port number for Redis cluster connections"
  value       = aws_elasticache_replication_group.main.port
}

output "redis_auth_token" {
  description = "Authentication token for Redis cluster access"
  value       = random_password.redis_auth_token.result
  sensitive   = true
}