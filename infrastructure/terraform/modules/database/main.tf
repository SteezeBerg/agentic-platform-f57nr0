# Provider configuration
terraform {
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

# Local variables
locals {
  name_prefix = "${var.environment}-agentbuilder"
  common_tags = {
    Environment = var.environment
    Project     = "AgentBuilderHub"
    ManagedBy   = "Terraform"
  }
}

# Random suffix for unique naming
resource "random_id" "suffix" {
  byte_length = 4
}

# DynamoDB Tables
resource "aws_dynamodb_table" "agent_config" {
  name           = "${local.name_prefix}-agent-config"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  stream_enabled = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "user_data" {
  name           = "${local.name_prefix}-user-data"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "user_id"
  stream_enabled = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "user_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "deployment_metrics" {
  name           = "${local.name_prefix}-deployment-metrics"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "deployment_id"
  range_key      = "timestamp"
  stream_enabled = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "deployment_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "knowledge_index" {
  name           = "${local.name_prefix}-knowledge-index"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "source_id"
  range_key      = "content_id"
  stream_enabled = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "source_id"
    type = "S"
  }

  attribute {
    name = "content_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = local.common_tags
}

# Aurora PostgreSQL Cluster
resource "aws_rds_cluster" "main" {
  cluster_identifier     = "${local.name_prefix}-aurora-cluster"
  engine                = "aurora-postgresql"
  engine_version        = "15.4"
  database_name         = "agentbuilder"
  master_username       = "admin"
  master_password       = random_password.aurora_password.result
  storage_encrypted     = true
  backup_retention_period = var.backup_retention_days
  preferred_backup_window = "03:00-04:00"
  skip_final_snapshot   = false
  final_snapshot_identifier = "${local.name_prefix}-final-snapshot-${random_id.suffix.hex}"
  db_subnet_group_name  = aws_db_subnet_group.aurora.name
  vpc_security_group_ids = [aws_security_group.aurora.id]
  
  serverlessv2_scaling_configuration {
    max_capacity = 16
    min_capacity = 0.5
  }

  tags = local.common_tags
}

resource "random_password" "aurora_password" {
  length  = 16
  special = true
}

resource "aws_db_subnet_group" "aurora" {
  name       = "${local.name_prefix}-aurora-subnet-group"
  subnet_ids = var.private_subnet_ids
  tags       = local.common_tags
}

# OpenSearch Domain
resource "aws_opensearch_domain" "main" {
  domain_name    = "${local.name_prefix}-search"
  engine_version = "OpenSearch_2.9"

  cluster_config {
    instance_type            = "r6g.large.search"
    instance_count          = 2
    zone_awareness_enabled  = true
    
    zone_awareness_config {
      availability_zone_count = 2
    }
  }

  ebs_options {
    ebs_enabled = true
    volume_size = 100
    volume_type = "gp3"
  }

  encrypt_at_rest {
    enabled = true
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = true
    master_user_options {
      master_user_name     = "admin"
      master_user_password = random_password.opensearch_password.result
    }
  }

  vpc_options {
    subnet_ids         = [var.private_subnet_ids[0], var.private_subnet_ids[1]]
    security_group_ids = [aws_security_group.opensearch.id]
  }

  tags = local.common_tags
}

resource "random_password" "opensearch_password" {
  length  = 16
  special = true
}

# Redis Cluster
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${local.name_prefix}-redis"
  description               = "Redis cluster for Agent Builder Hub"
  node_type                 = "cache.r6g.large"
  port                      = 6379
  parameter_group_family    = "redis7"
  automatic_failover_enabled = true
  multi_az_enabled          = true
  num_cache_clusters        = 2
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                = random_password.redis_auth_token.result
  subnet_group_name         = aws_elasticache_subnet_group.redis.name
  security_group_ids        = [aws_security_group.redis.id]

  tags = local.common_tags
}

resource "random_password" "redis_auth_token" {
  length  = 32
  special = false
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis-subnet-group"
  subnet_ids = var.private_subnet_ids
}

# Security Groups
resource "aws_security_group" "aurora" {
  name        = "${local.name_prefix}-aurora-sg"
  description = "Security group for Aurora PostgreSQL cluster"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  tags = local.common_tags
}

resource "aws_security_group" "opensearch" {
  name        = "${local.name_prefix}-opensearch-sg"
  description = "Security group for OpenSearch domain"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  tags = local.common_tags
}

resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis-sg"
  description = "Security group for Redis cluster"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  tags = local.common_tags
}

# Data Sources
data "aws_vpc" "selected" {
  id = var.vpc_id
}

# Outputs
output "dynamodb_table_arns" {
  value = {
    agent_config       = aws_dynamodb_table.agent_config.arn
    user_data         = aws_dynamodb_table.user_data.arn
    deployment_metrics = aws_dynamodb_table.deployment_metrics.arn
    knowledge_index    = aws_dynamodb_table.knowledge_index.arn
  }
}

output "aurora_cluster_endpoint" {
  value = aws_rds_cluster.main.endpoint
}

output "opensearch_endpoint" {
  value = aws_opensearch_domain.main.endpoint
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.main.primary_endpoint_address
}