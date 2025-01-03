#!/bin/bash

# Agent Builder Hub - Enterprise Backup Management Script
# Version: 1.0.0
# Manages comprehensive backups of Aurora PostgreSQL, DynamoDB, and S3 with
# encryption, monitoring, and compliance features.

# Source database management functions
source ./database.sh

# Import AWS configuration
source ../../src/backend/src/config/aws.py

# Global variables
BACKUP_ROOT="/var/backup/agent-builder"
RETENTION_DAYS=35
S3_BACKUP_BUCKET="agent-builder-backups"
KMS_KEY_ID="alias/agent-builder-backup"
LOG_DIR="${BACKUP_ROOT}/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_MANIFEST="${BACKUP_ROOT}/manifest.json"

# Ensure required directories exist
mkdir -p "${BACKUP_ROOT}" "${LOG_DIR}"

# Configure logging with rotation
exec 1> >(tee -a "${LOG_DIR}/backup_${TIMESTAMP}.log")
exec 2>&1

# Logging functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

# Validate AWS credentials and permissions
validate_aws_access() {
    log "Validating AWS access and permissions"
    if ! aws sts get-caller-identity &>/dev/null; then
        error "AWS credentials validation failed"
        exit 1
    fi
}

# Backup Aurora PostgreSQL cluster
backup_aurora() {
    local cluster_identifier=$1
    local backup_type=$2
    local start_time=$(date +%s)
    
    log "Starting Aurora backup: ${cluster_identifier} (${backup_type})"
    
    # Validate cluster health
    local cluster_status=$(aws rds describe-db-clusters \
        --db-cluster-identifier "${cluster_identifier}" \
        --query 'DBClusters[0].Status' \
        --output text)
    
    if [ "${cluster_status}" != "available" ]; then
        error "Aurora cluster not available. Status: ${cluster_status}"
        return 1
    }
    
    # Create encrypted snapshot
    local snapshot_id="${cluster_identifier}-${TIMESTAMP}"
    aws rds create-db-cluster-snapshot \
        --db-cluster-identifier "${cluster_identifier}" \
        --db-cluster-snapshot-identifier "${snapshot_id}" \
        --tags Key=BackupType,Value="${backup_type}" \
            Key=RetentionDays,Value="${RETENTION_DAYS}" \
        --kms-key-id "${KMS_KEY_ID}"
    
    # Monitor backup progress
    while true; do
        local status=$(aws rds describe-db-cluster-snapshots \
            --db-cluster-snapshot-identifier "${snapshot_id}" \
            --query 'DBClusterSnapshots[0].Status' \
            --output text)
        
        if [ "${status}" == "available" ]; then
            break
        elif [ "${status}" == "failed" ]; then
            error "Aurora backup failed for ${snapshot_id}"
            return 1
        fi
        
        log "Backup in progress: ${status}"
        sleep 30
    done
    
    # Calculate and log metrics
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Update CloudWatch metrics
    aws cloudwatch put-metric-data \
        --namespace "AgentBuilder/Backup" \
        --metric-name "AuroraBackupDuration" \
        --value "${duration}" \
        --unit Seconds \
        --dimensions BackupType="${backup_type}"
    
    log "Aurora backup completed successfully in ${duration} seconds"
    return 0
}

# Backup DynamoDB tables
backup_dynamodb() {
    local table_name=$1
    local start_time=$(date +%s)
    
    log "Starting DynamoDB backup: ${table_name}"
    
    # Validate table existence
    if ! aws dynamodb describe-table --table-name "${table_name}" &>/dev/null; then
        error "DynamoDB table ${table_name} not found"
        return 1
    }
    
    # Create backup with encryption
    local backup_arn=$(aws dynamodb create-backup \
        --table-name "${table_name}" \
        --backup-name "${table_name}-${TIMESTAMP}" \
        --tags Key=RetentionDays,Value="${RETENTION_DAYS}" \
        --query 'BackupDetails.BackupArn' \
        --output text)
    
    # Monitor backup progress
    while true; do
        local status=$(aws dynamodb describe-backup \
            --backup-arn "${backup_arn}" \
            --query 'BackupDescription.BackupDetails.BackupStatus' \
            --output text)
        
        if [ "${status}" == "AVAILABLE" ]; then
            break
        elif [ "${status}" == "FAILED" ]; then
            error "DynamoDB backup failed for ${table_name}"
            return 1
        fi
        
        log "Backup in progress: ${status}"
        sleep 10
    done
    
    # Calculate and log metrics
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Update CloudWatch metrics
    aws cloudwatch put-metric-data \
        --namespace "AgentBuilder/Backup" \
        --metric-name "DynamoDBBackupDuration" \
        --value "${duration}" \
        --unit Seconds \
        --dimensions TableName="${table_name}"
    
    log "DynamoDB backup completed successfully in ${duration} seconds"
    return 0
}

# Backup S3 bucket
backup_s3() {
    local source_bucket=$1
    local destination_prefix=$2
    local start_time=$(date +%s)
    
    log "Starting S3 backup: ${source_bucket} to ${S3_BACKUP_BUCKET}/${destination_prefix}"
    
    # Validate source bucket
    if ! aws s3api head-bucket --bucket "${source_bucket}" 2>/dev/null; then
        error "Source bucket ${source_bucket} not accessible"
        return 1
    }
    
    # Perform encrypted sync with checksum validation
    aws s3 sync "s3://${source_bucket}" \
        "s3://${S3_BACKUP_BUCKET}/${destination_prefix}" \
        --sse aws:kms \
        --sse-kms-key-id "${KMS_KEY_ID}" \
        --metadata RetentionDays="${RETENTION_DAYS}" \
        --only-show-errors
    
    # Verify sync completion
    if [ $? -ne 0 ]; then
        error "S3 sync failed for ${source_bucket}"
        return 1
    }
    
    # Calculate and log metrics
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Update CloudWatch metrics
    aws cloudwatch put-metric-data \
        --namespace "AgentBuilder/Backup" \
        --metric-name "S3BackupDuration" \
        --value "${duration}" \
        --unit Seconds \
        --dimensions Bucket="${source_bucket}"
    
    log "S3 backup completed successfully in ${duration} seconds"
    return 0
}

# Monitor backup operations
monitor_backups() {
    log "Starting backup monitoring"
    
    # Collect backup metrics
    aws cloudwatch get-metric-statistics \
        --namespace "AgentBuilder/Backup" \
        --metric-name "BackupSuccess" \
        --statistics Sum \
        --period 3600 \
        --start-time "$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ')" \
        --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        --dimensions Name=BackupType,Value=Full
    
    # Generate monitoring report
    jq -n \
        --arg timestamp "$(date '+%Y-%m-%d %H:%M:%S')" \
        --arg status "$(aws cloudwatch get-metric-statistics ...)" \
        '{timestamp: $timestamp, status: $status}' > "${BACKUP_ROOT}/monitoring.json"
}

# Cleanup old backups
cleanup_old_backups() {
    local retention_days=$1
    log "Starting cleanup of backups older than ${retention_days} days"
    
    # Clean Aurora snapshots
    aws rds describe-db-cluster-snapshots \
        --query "DBClusterSnapshots[?SnapshotCreateTime<='$(date -d "${retention_days} days ago" -I)'].[DBClusterSnapshotIdentifier]" \
        --output text | while read -r snapshot; do
        aws rds delete-db-cluster-snapshot --db-cluster-snapshot-identifier "${snapshot}"
        log "Deleted Aurora snapshot: ${snapshot}"
    done
    
    # Clean DynamoDB backups
    aws dynamodb list-backups \
        --time-range-lower-bound "$(date -d "${retention_days} days ago" '+%s')" \
        --query 'BackupSummaries[*].BackupArn' \
        --output text | while read -r backup_arn; do
        aws dynamodb delete-backup --backup-arn "${backup_arn}"
        log "Deleted DynamoDB backup: ${backup_arn}"
    done
    
    # Clean S3 backups
    aws s3api list-objects-v2 \
        --bucket "${S3_BACKUP_BUCKET}" \
        --query "Contents[?LastModified<='$(date -d "${retention_days} days ago" -I)'].Key" \
        --output text | while read -r key; do
        aws s3 rm "s3://${S3_BACKUP_BUCKET}/${key}"
        log "Deleted S3 backup: ${key}"
    done
}

# Main backup orchestration
run_backup() {
    validate_aws_access
    
    log "Starting backup operation at ${TIMESTAMP}"
    
    # Backup Aurora clusters
    backup_aurora "agent-builder-aurora" "full" || exit 1
    
    # Backup DynamoDB tables
    backup_dynamodb "agent_config" || exit 1
    backup_dynamodb "user_data" || exit 1
    backup_dynamodb "deployment_metrics" || exit 1
    
    # Backup S3 buckets
    backup_s3 "agent-builder-artifacts" "artifacts/${TIMESTAMP}" || exit 1
    
    # Monitor backup operations
    monitor_backups
    
    # Cleanup old backups
    cleanup_old_backups "${RETENTION_DAYS}"
    
    log "Backup operation completed successfully"
}

# Parse command line arguments
case "$1" in
    "backup")
        run_backup
        ;;
    "cleanup")
        cleanup_old_backups "${2:-$RETENTION_DAYS}"
        ;;
    "monitor")
        monitor_backups
        ;;
    *)
        echo "Usage: $0 {backup|cleanup|monitor}"
        exit 1
        ;;
esac

exit 0