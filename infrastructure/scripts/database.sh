#!/bin/bash

# Database Management Script for Agent Builder Hub
# Version: 1.0.0
# Manages Aurora PostgreSQL, DynamoDB, OpenSearch and Redis infrastructure
# with enhanced performance optimization and automated management capabilities

# Import AWS region from config
source ../../src/backend/src/config/aws.py
AWS_REGION=${DEFAULT_REGION:-us-west-2}

# Global variables
DB_ROOT="/var/lib/agent-builder/db"
AURORA_CLUSTER="agent-builder-aurora"
DYNAMODB_TABLES='["agent_config", "user_data", "deployment_metrics", "knowledge_index"]'
OPENSEARCH_DOMAIN="agent-builder-search"
REDIS_CLUSTER="agent-builder-cache"
LOG_DIR="/var/log/agent-builder/db"

# Ensure required directories exist
mkdir -p "$DB_ROOT" "$LOG_DIR"

# Logging configuration
exec 1> >(tee -a "${LOG_DIR}/database_$(date +%Y%m%d).log")
exec 2>&1

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

# Health check function
check_health() {
    local service=$1
    case $service in
        "aurora")
            aws rds describe-db-clusters \
                --db-cluster-identifier "$AURORA_CLUSTER" \
                --query 'DBClusters[0].Status' \
                --output text
            ;;
        "dynamodb")
            for table in $(echo "$DYNAMODB_TABLES" | jq -r '.[]'); do
                aws dynamodb describe-table \
                    --table-name "$table" \
                    --query 'Table.TableStatus' \
                    --output text
            done
            ;;
        "opensearch")
            aws opensearch describe-domain \
                --domain-name "$OPENSEARCH_DOMAIN" \
                --query 'DomainStatus.Processing' \
                --output text
            ;;
        "redis")
            aws elasticache describe-replication-groups \
                --replication-group-id "$REDIS_CLUSTER" \
                --query 'ReplicationGroups[0].Status' \
                --output text
            ;;
    esac
}

# Initialize Aurora PostgreSQL cluster
initialize_aurora() {
    local cluster_id=$1
    local db_name=$2
    
    log "Initializing Aurora PostgreSQL cluster: $cluster_id"
    
    # Wait for cluster to be available
    while [[ $(check_health "aurora") != "available" ]]; do
        log "Waiting for Aurora cluster to be available..."
        sleep 30
    done
    
    # Get cluster endpoint
    local endpoint=$(aws rds describe-db-clusters \
        --db-cluster-identifier "$cluster_id" \
        --query 'DBClusters[0].Endpoint' \
        --output text)
    
    # Initialize database schema
    PGPASSWORD="${DB_PASSWORD}" psql -h "$endpoint" -U "${DB_USER}" -d "$db_name" -f "${DB_ROOT}/schema/init.sql"
    
    # Configure performance parameters
    aws rds modify-db-cluster-parameter-group \
        --db-cluster-parameter-group-name "${cluster_id}-params" \
        --parameters "ParameterName=max_connections,ParameterValue=5000,ApplyMethod=pending-reboot" \
                    "ParameterName=shared_buffers,ParameterValue=4096MB,ApplyMethod=pending-reboot"
    
    log "Aurora PostgreSQL initialization completed"
}

# Monitor database health and performance
monitor_databases() {
    log "Starting comprehensive database monitoring"
    
    # Aurora metrics
    aws cloudwatch get-metric-statistics \
        --namespace AWS/RDS \
        --metric-name CPUUtilization \
        --dimensions Name=DBClusterIdentifier,Value="$AURORA_CLUSTER" \
        --start-time "$(date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ')" \
        --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        --period 300 \
        --statistics Average
    
    # DynamoDB metrics
    for table in $(echo "$DYNAMODB_TABLES" | jq -r '.[]'); do
        aws cloudwatch get-metric-statistics \
            --namespace AWS/DynamoDB \
            --metric-name ConsumedReadCapacityUnits \
            --dimensions Name=TableName,Value="$table" \
            --start-time "$(date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ')" \
            --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
            --period 300 \
            --statistics Sum
    done
    
    # OpenSearch metrics
    aws cloudwatch get-metric-statistics \
        --namespace AWS/ES \
        --metric-name FreeStorageSpace \
        --dimensions Name=DomainName,Value="$OPENSEARCH_DOMAIN" \
        --start-time "$(date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ')" \
        --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        --period 300 \
        --statistics Average
    
    # Redis metrics
    aws cloudwatch get-metric-statistics \
        --namespace AWS/ElastiCache \
        --metric-name DatabaseMemoryUsagePercentage \
        --dimensions Name=ReplicationGroupId,Value="$REDIS_CLUSTER" \
        --start-time "$(date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ')" \
        --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        --period 300 \
        --statistics Average
}

# Maintenance mode management
maintenance_mode() {
    local operation=$1
    local enable=$2
    
    log "Managing maintenance mode: $operation ($enable)"
    
    case $operation in
        "aurora")
            if [ "$enable" = true ]; then
                # Create pre-maintenance backup
                aws rds create-db-cluster-snapshot \
                    --db-cluster-identifier "$AURORA_CLUSTER" \
                    --db-cluster-snapshot-identifier "${AURORA_CLUSTER}-pre-maintenance-$(date +%Y%m%d)"
                
                # Enable maintenance mode
                aws rds modify-db-cluster \
                    --db-cluster-identifier "$AURORA_CLUSTER" \
                    --preferred-maintenance-window "Mon:03:00-Mon:04:00"
            else
                # Disable maintenance mode
                aws rds modify-db-cluster \
                    --db-cluster-identifier "$AURORA_CLUSTER" \
                    --no-preferred-maintenance-window
            fi
            ;;
        "dynamodb")
            for table in $(echo "$DYNAMODB_TABLES" | jq -r '.[]'); do
                if [ "$enable" = true ]; then
                    # Enable point-in-time recovery
                    aws dynamodb update-continuous-backups \
                        --table-name "$table" \
                        --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
                else
                    # Disable point-in-time recovery
                    aws dynamodb update-continuous-backups \
                        --table-name "$table" \
                        --point-in-time-recovery-specification PointInTimeRecoveryEnabled=false
                fi
            done
            ;;
    esac
}

# Main function for database initialization
initialize_databases() {
    log "Starting database initialization"
    
    # Initialize Aurora
    initialize_aurora "$AURORA_CLUSTER" "agent_builder"
    
    # Initialize DynamoDB tables
    for table in $(echo "$DYNAMODB_TABLES" | jq -r '.[]'); do
        aws dynamodb create-table \
            --table-name "$table" \
            --attribute-definitions AttributeName=id,AttributeType=S \
            --key-schema AttributeName=id,KeyType=HASH \
            --billing-mode PAY_PER_REQUEST \
            --tags Key=Environment,Value=production
    done
    
    # Initialize OpenSearch domain
    aws opensearch create-domain \
        --domain-name "$OPENSEARCH_DOMAIN" \
        --engine-version "OpenSearch_2.5" \
        --cluster-config InstanceType=r6g.large.search,InstanceCount=3
    
    # Initialize Redis cluster
    aws elasticache create-replication-group \
        --replication-group-id "$REDIS_CLUSTER" \
        --replication-group-description "Agent Builder Cache Cluster" \
        --cache-node-type cache.r6g.large \
        --num-cache-clusters 3
    
    log "Database initialization completed"
}

# Parse command line arguments
case "$1" in
    "init")
        initialize_databases
        ;;
    "monitor")
        monitor_databases
        ;;
    "maintenance")
        maintenance_mode "$2" "$3"
        ;;
    *)
        echo "Usage: $0 {init|monitor|maintenance}"
        exit 1
        ;;
esac

exit 0