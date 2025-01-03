# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for common resource tagging
locals {
  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project
    ManagedBy   = "terraform"
    UpdatedAt   = timestamp()
  })
}

# ECS Cluster with container insights and capacity provider strategy
resource "aws_ecs_cluster" "main" {
  name = var.ecs_cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight           = 1
    base            = 1
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight           = 2
  }

  tags = local.common_tags
}

# ECS Cluster Capacity Provider Associations
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 1
    capacity_provider = "FARGATE"
  }
}

# Agent Service Task Definition
resource "aws_ecs_task_definition" "agent_service" {
  family                   = "agent-service"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = var.agent_service_cpu
  memory                  = var.agent_service_memory
  execution_role_arn      = aws_iam_role.ecs_execution.arn
  task_role_arn           = aws_iam_role.agent_service.arn

  container_definitions = jsonencode([
    {
      name  = "agent-service"
      image = "${var.ecr_repository_url}:${var.agent_service_image_tag}"
      
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/agent-service"
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "agent"
        }
      }

      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "ENVIRONMENT"
          value = var.environment
        }
      ]

      secrets = [
        {
          name      = "API_KEY"
          valueFrom = aws_secretsmanager_secret.api_key.arn
        }
      ]
    }
  ])

  tags = local.common_tags
}

# API Service Task Definition
resource "aws_ecs_task_definition" "api_service" {
  family                   = "api-service"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = var.api_service_cpu
  memory                  = var.api_service_memory
  execution_role_arn      = aws_iam_role.ecs_execution.arn
  task_role_arn           = aws_iam_role.api_service.arn

  container_definitions = jsonencode([
    {
      name  = "api-service"
      image = "${var.ecr_repository_url}:${var.api_service_image_tag}"
      
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/api-service"
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "api"
        }
      }

      portMappings = [
        {
          containerPort = 8000
          protocol      = "tcp"
        }
      ]
    }
  ])

  tags = local.common_tags
}

# ECS Services
resource "aws_ecs_service" "agent_service" {
  name            = "agent-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.agent_service.arn
  desired_count   = var.agent_service_desired_count

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [var.ecs_security_group_id]
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight           = 1
    base             = 1
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight           = 2
  }

  service_registries {
    registry_arn = aws_service_discovery_service.agent_service.arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  tags = local.common_tags
}

resource "aws_ecs_service" "api_service" {
  name            = "api-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api_service.arn
  desired_count   = var.api_service_desired_count

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [var.ecs_security_group_id]
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight           = 1
    base             = 1
  }

  service_registries {
    registry_arn = aws_service_discovery_service.api_service.arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = local.common_tags
}

# Service Discovery
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "agent-builder.local"
  vpc         = var.vpc_id
  description = "Service discovery namespace for Agent Builder Hub"
}

resource "aws_service_discovery_service" "agent_service" {
  name = "agent-service"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

resource "aws_service_discovery_service" "api_service" {
  name = "api-service"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

# Auto Scaling
resource "aws_appautoscaling_target" "agent_service" {
  max_capacity       = var.agent_service_max_count
  min_capacity       = var.agent_service_min_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.agent_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "agent_service_cpu" {
  name               = "agent-service-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.agent_service.resource_id
  scalable_dimension = aws_appautoscaling_target.agent_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.agent_service.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 75.0
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# Outputs
output "ecs_cluster_id" {
  description = "ID of the ECS cluster"
  value       = aws_ecs_cluster.main.id
}

output "service_arns" {
  description = "ARNs of the ECS services"
  value = {
    agent_service = aws_ecs_service.agent_service.id
    api_service   = aws_ecs_service.api_service.id
  }
}

output "service_discovery_namespace" {
  description = "Service discovery namespace details"
  value       = aws_service_discovery_private_dns_namespace.main.name
}