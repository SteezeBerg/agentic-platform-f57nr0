# Core environment settings
environment = "staging"
aws_region  = "us-west-2"

# VPC Configuration
vpc_cidr = "10.1.0.0/16"  # Staging VPC CIDR block
availability_zones = ["us-west-2a", "us-west-2b", "us-west-2c"]

# ECS Configuration
ecs_cluster_name = "agent-builder-staging"
ecs_config = {
  cluster_name = "agent-builder-staging"
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  container_insights = true
  task_cpu = 1024
  task_memory = 2048
  autoscaling = {
    min_capacity = 2
    max_capacity = 20
    target_cpu_utilization = 70
    target_memory_utilization = 80
  }
}

# Database Configuration
dynamodb_table_names = {
  agents = "agent-config-staging"
  deployments = "agent-deployments-staging"
  metrics = "agent-metrics-staging"
}

database_config = {
  dynamodb = {
    table_name = "agent-data-staging"
    billing_mode = "PAY_PER_REQUEST"
    enable_encryption = true
    enable_point_in_time_recovery = true
  }
  aurora = {
    cluster_identifier = "agent-builder-staging"
    engine_version = "13.7"
    instance_class = "db.r6g.large"
    instances = 2
    deletion_protection = true
    backup_retention_period = 14
    enable_performance_insights = true
  }
}

# Search Configuration
opensearch_domain_name = "agent-knowledge-staging"
search_config = {
  domain_name = "agent-knowledge-staging"
  engine_version = "OpenSearch_1.3"
  instance_type = "r6g.large.search"
  instance_count = 2
  zone_awareness_enabled = true
  ebs_options = {
    volume_type = "gp3"
    volume_size = 100
  }
  encrypt_at_rest = true
  node_to_node_encryption = true
}

# Security Configuration
cognito_user_pool_name = "agent-builder-staging-users"
kms_key_alias = "agent-builder-staging"
security_config = {
  kms = {
    deletion_window_in_days = 14
    enable_key_rotation = true
  }
  waf = {
    ip_rate_limit = 2000
    rule_names = ["AWSManagedRulesCommonRuleSet", "AWSManagedRulesKnownBadInputsRuleSet"]
  }
  network_acls = {
    default_network_acl_deny_all = true
    restricted_ports = [22, 3389]
  }
}

# Monitoring Configuration
cloudwatch_retention_days = 30
monitoring_config = {
  cloudwatch = {
    log_retention_days = 30
    metric_namespaces = ["AgentBuilder/Staging", "AWS/ECS", "AWS/RDS"]
  }
  alerts = {
    cpu_utilization_threshold = 80
    memory_utilization_threshold = 80
    error_rate_threshold = 5
    notification_email = "staging-alerts@hakkoda.io"
  }
}

# Resource Tags
tags = {
  Environment = "staging"
  Application = "agent-builder-hub"
  ManagedBy = "terraform"
  Team = "platform"
  CostCenter = "platform-staging"
  DataClassification = "internal"
  Backup = "daily"
}