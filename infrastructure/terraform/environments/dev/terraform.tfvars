# Environment Configuration
environment = "dev"
aws_region = "us-west-2"

# VPC Configuration
vpc_config = {
  cidr_block              = "10.0.0.0/16"
  public_subnet_cidrs     = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs    = ["10.0.11.0/24", "10.0.12.0/24"]
  isolated_subnet_cidrs   = ["10.0.21.0/24", "10.0.22.0/24"]
  enable_nat_gateway      = true
  enable_vpn_gateway      = false
  enable_flow_logs        = true
  flow_logs_retention_days = 14
}

# ECS Configuration
ecs_config = {
  cluster_name = "agent-builder-hub-dev"
  capacity_providers = ["FARGATE_SPOT", "FARGATE"]
  container_insights = true
  task_cpu    = 256
  task_memory = 512
  autoscaling = {
    min_capacity = 1
    max_capacity = 5
    target_cpu_utilization    = 70
    target_memory_utilization = 70
  }
}

# Database Configuration
database_config = {
  dynamodb = {
    table_name = "agent-builder-hub-agents-dev"
    billing_mode = "PAY_PER_REQUEST"
    enable_encryption = true
    enable_point_in_time_recovery = true
  }
  aurora = {
    cluster_identifier = "agent-builder-hub-dev"
    engine_version = "13.8"
    instance_class = "db.t3.medium"
    instances = 2
    deletion_protection = false
    backup_retention_period = 7
    enable_performance_insights = true
  }
}

# Search Configuration
search_config = {
  domain_name = "agent-builder-hub-dev"
  engine_version = "OpenSearch_2.5"
  instance_type = "t3.small.search"
  instance_count = 2
  zone_awareness_enabled = true
  ebs_options = {
    volume_type = "gp3"
    volume_size = 20
  }
  encrypt_at_rest = true
  node_to_node_encryption = true
}

# Security Configuration
security_config = {
  kms = {
    deletion_window_in_days = 7
    enable_key_rotation = true
  }
  waf = {
    ip_rate_limit = 2000
    rule_names = [
      "AWSManagedRulesCommonRuleSet",
      "AWSManagedRulesKnownBadInputsRuleSet"
    ]
  }
  network_acls = {
    default_network_acl_deny_all = true
    restricted_ports = [22, 3389]
  }
}

# Monitoring Configuration
monitoring_config = {
  cloudwatch = {
    log_retention_days = 14
    metric_namespaces = [
      "AWS/ECS",
      "AWS/DynamoDB",
      "AWS/RDS",
      "AWS/OpenSearch"
    ]
  }
  alerts = {
    cpu_utilization_threshold = 80
    memory_utilization_threshold = 80
    error_rate_threshold = 5
    notification_email = "platform-team@hakkoda.io"
  }
}

# Resource Tags
tags = {
  Environment = "dev"
  Application = "agent-builder-hub"
  ManagedBy   = "terraform"
  Team        = "platform"
  CostCenter  = "development"
  Project     = "agent-builder-hub"
  GitRepo     = "agent-builder-hub"
}