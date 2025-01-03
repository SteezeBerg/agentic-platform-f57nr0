# Production Environment Identifier
environment = "prod"

# Primary AWS Region - US East for optimal latency and service availability
aws_region = "us-east-1"

# Production VPC CIDR - /16 block allowing for future growth
vpc_cidr = "10.0.0.0/16"

# Multi-AZ deployment across three availability zones for high availability
availability_zones = [
  "us-east-1a",
  "us-east-1b",
  "us-east-1c"
]

# Production ECS Cluster Configuration
ecs_cluster_config = {
  cluster_name = "agent-builder-prod"
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  container_insights = true
  task_cpu = 2048    # 2 vCPU
  task_memory = 4096 # 4GB
  autoscaling = {
    min_capacity = 3
    max_capacity = 30
    target_cpu_utilization = 70
    target_memory_utilization = 75
  }
}

# Production DynamoDB Configuration
dynamodb_tables = {
  agent_repository = {
    billing_mode = "PROVISIONED"
    read_capacity = 100
    write_capacity = 50
    autoscaling = {
      min_capacity = 50
      max_capacity = 200
      target_utilization = 70
    }
    point_in_time_recovery = true
    encryption = {
      enabled = true
      deletion_protection = true
    }
  }
}

# Production Aurora PostgreSQL Cluster Configuration
aurora_cluster_config = {
  cluster_identifier = "agent-builder-prod"
  engine_version = "13.7"
  instance_class = "db.r6g.xlarge"
  instances = 3
  backup_retention_period = 35
  performance_insights_enabled = true
  deletion_protection = true
  auto_minor_version_upgrade = true
  storage = {
    encrypted = true
    iops = 3000
    allocated_storage = 100
  }
}

# Production OpenSearch Configuration
opensearch_config = {
  domain_name = "agent-builder-prod"
  engine_version = "OpenSearch_1.3"
  instance_type = "r6g.xlarge.search"
  instance_count = 3
  zone_awareness_enabled = true
  ebs_options = {
    volume_type = "gp3"
    volume_size = 500
    iops = 3000
  }
  encrypt_at_rest = true
  node_to_node_encryption = true
  dedicated_master_enabled = true
  dedicated_master_type = "r6g.large.search"
  dedicated_master_count = 3
}

# Production Security Configuration
security_config = {
  kms = {
    deletion_window_in_days = 30
    enable_key_rotation = true
    multi_region = true
  }
  waf = {
    ip_rate_limit = 2000
    rule_names = [
      "AWSManagedRulesCommonRuleSet",
      "AWSManagedRulesKnownBadInputsRuleSet",
      "AWSManagedRulesAmazonIpReputationList",
      "AWSManagedRulesLinuxRuleSet"
    ]
  }
  network_acls = {
    default_network_acl_deny_all = true
    restricted_ports = [22, 3389]
  }
  ssl_policy = "ELBSecurityPolicy-TLS-1-2-2017-01"
}

# Production Monitoring Configuration
monitoring_config = {
  cloudwatch = {
    log_retention_days = 365
    metric_namespaces = [
      "AWS/ECS",
      "AWS/RDS",
      "AWS/DynamoDB",
      "AWS/OpenSearch",
      "AWS/Lambda"
    ]
  }
  alerts = {
    cpu_utilization_threshold = 80
    memory_utilization_threshold = 80
    error_rate_threshold = 1
    notification_email = "ops-team@hakkoda.io"
  }
  enhanced_monitoring = true
  xray_tracing = true
}

# Production Backup Configuration
backup_config = {
  retention_period = 35
  cross_region_backup = true
  backup_regions = ["us-west-2"]
  backup_schedule = "cron(0 5 ? * * *)"
  lifecycle_rules = {
    transition_glacier_days = 90
    expiration_days = 365
  }
}

# Production Resource Tags
tags = {
  Environment = "prod"
  Application = "agent-builder-hub"
  ManagedBy = "terraform"
  BusinessUnit = "engineering"
  CostCenter = "100"
  Compliance = "sox"
  DataClassification = "confidential"
  HighAvailability = "true"
  BackupFrequency = "daily"
  DisasterRecovery = "enabled"
}