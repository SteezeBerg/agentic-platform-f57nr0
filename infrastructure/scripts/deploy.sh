#!/bin/bash

# Agent Builder Hub Deployment Script
# Version: 1.0.0
# Dependencies: aws-cli v2.0+, jq v1.6+, docker v20.0+

set -euo pipefail

# Source monitoring functions
source ./monitoring.sh

# Global variables
AWS_REGION=${AWS_REGION:-"us-west-2"}
ENVIRONMENTS=("dev" "staging" "prod")
ECR_REPOSITORY="agent-builder"
DOCKER_BUILDKIT=1
DEPLOYMENT_TIMEOUT=900
HEALTH_CHECK_INTERVAL=10
ROLLBACK_THRESHOLD=300

# Utility functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

check_dependencies() {
    command -v aws >/dev/null 2>&1 || { log "ERROR: AWS CLI is required but not installed."; exit 1; }
    command -v jq >/dev/null 2>&1 || { log "ERROR: jq is required but not installed."; exit 1; }
    command -v docker >/dev/null 2>&1 || { log "ERROR: docker is required but not installed."; exit 1; }
}

validate_environment() {
    local env=$1
    if [[ ! " ${ENVIRONMENTS[@]} " =~ " ${env} " ]]; then
        log "ERROR: Invalid environment. Must be one of: ${ENVIRONMENTS[*]}"
        exit 1
    }
}

# Backend deployment function
deploy_backend() {
    local environment=$1
    local version=$2
    local config_file=$3

    log "Starting backend deployment for environment: $environment"

    # Build and push Docker image
    docker build \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        --cache-from ${ECR_REPOSITORY}:latest \
        -t ${ECR_REPOSITORY}:${version} \
        -f Dockerfile .

    # Scan image for vulnerabilities
    aws ecr start-image-scan \
        --repository-name ${ECR_REPOSITORY} \
        --image-id imageTag=${version}

    # Push image to ECR
    aws ecr get-login-password --region ${AWS_REGION} | \
        docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

    docker push ${ECR_REPOSITORY}:${version}

    # Create new task definition
    local task_def=$(aws ecs describe-task-definition \
        --task-definition ${ECR_REPOSITORY}-${environment} \
        --query 'taskDefinition' | \
        jq ".containerDefinitions[0].image = \"${ECR_REPOSITORY}:${version}\"")

    aws ecs register-task-definition \
        --family ${ECR_REPOSITORY}-${environment} \
        --cli-input-json "$task_def"

    # Start blue-green deployment
    local service_name="${ECR_REPOSITORY}-${environment}"
    aws ecs update-service \
        --cluster ${service_name}-cluster \
        --service ${service_name} \
        --task-definition ${ECR_REPOSITORY}-${environment} \
        --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100" \
        --force-new-deployment

    # Monitor deployment
    local start_time=$(date +%s)
    while true; do
        local deployment_status=$(aws ecs describe-services \
            --cluster ${service_name}-cluster \
            --services ${service_name} \
            --query 'services[0].deployments[0].status' \
            --output text)

        if [[ "$deployment_status" == "PRIMARY" ]]; then
            log "Deployment completed successfully"
            break
        fi

        if (( $(date +%s) - start_time > DEPLOYMENT_TIMEOUT )); then
            log "ERROR: Deployment timeout exceeded"
            rollback "$environment" "$service_name" "$version"
            exit 1
        fi

        sleep $HEALTH_CHECK_INTERVAL
    done

    # Configure monitoring
    setup_monitoring "$environment"
    configure_alarms "$environment" "$service_name" "alarm-config.json"
}

# Frontend deployment function
deploy_frontend() {
    local environment=$1
    local version=$2
    local config_file=$3

    log "Starting frontend deployment for environment: $environment"

    # Build and optimize assets
    npm run build
    npm run optimize

    # Upload to S3
    local bucket_name="${ECR_REPOSITORY}-${environment}-frontend"
    aws s3 sync \
        --delete \
        --cache-control "max-age=31536000,public" \
        dist/ s3://${bucket_name}/

    # Invalidate CloudFront cache
    local distribution_id=$(aws cloudfront list-distributions \
        --query "DistributionList.Items[?Aliases.Items[?contains(@,'${environment}')]].Id" \
        --output text)

    aws cloudfront create-invalidation \
        --distribution-id ${distribution_id} \
        --paths "/*"

    # Monitor CDN propagation
    local start_time=$(date +%s)
    while true; do
        local invalidation_status=$(aws cloudfront get-invalidation \
            --distribution-id ${distribution_id} \
            --id ${invalidation_id} \
            --query 'Invalidation.Status' \
            --output text)

        if [[ "$invalidation_status" == "Completed" ]]; then
            log "Frontend deployment completed successfully"
            break
        fi

        if (( $(date +%s) - start_time > DEPLOYMENT_TIMEOUT )); then
            log "ERROR: Frontend deployment timeout exceeded"
            exit 1
        fi

        sleep $HEALTH_CHECK_INTERVAL
    done
}

# Health check function
check_health() {
    local environment=$1
    local service_name=$2
    local config_file=$3

    log "Performing health checks for $service_name in $environment"

    # Check ECS service health
    local service_health=$(aws ecs describe-services \
        --cluster ${service_name}-cluster \
        --services ${service_name} \
        --query 'services[0].runningCount' \
        --output text)

    if [[ "$service_health" -lt 1 ]]; then
        log "ERROR: No healthy tasks running"
        return 1
    fi

    # Check target group health
    local target_health=$(aws elbv2 describe-target-health \
        --target-group-arn ${target_group_arn} \
        --query 'TargetHealthDescriptions[*].TargetHealth.State' \
        --output text)

    if [[ "$target_health" != *"healthy"* ]]; then
        log "ERROR: Unhealthy targets detected"
        return 1
    fi

    # Check application metrics
    local cpu_utilization=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/ECS \
        --metric-name CPUUtilization \
        --dimensions Name=ClusterName,Value=${service_name}-cluster \
        --start-time $(date -u -v-5M +%Y-%m-%dT%H:%M:%SZ) \
        --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
        --period 300 \
        --statistics Average \
        --query 'Datapoints[0].Average' \
        --output text)

    if (( $(echo "$cpu_utilization > 90" | bc -l) )); then
        log "WARNING: High CPU utilization detected"
    fi

    return 0
}

# Rollback function
rollback() {
    local environment=$1
    local service_name=$2
    local version=$3

    log "Initiating rollback for $service_name to previous version"

    # Get previous task definition
    local previous_task_def=$(aws ecs describe-task-definition \
        --task-definition ${service_name} \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)

    # Revert to previous version
    aws ecs update-service \
        --cluster ${service_name}-cluster \
        --service ${service_name} \
        --task-definition ${previous_task_def} \
        --force-new-deployment

    # Monitor rollback
    local start_time=$(date +%s)
    while true; do
        local rollback_status=$(aws ecs describe-services \
            --cluster ${service_name}-cluster \
            --services ${service_name} \
            --query 'services[0].deployments[0].status' \
            --output text)

        if [[ "$rollback_status" == "PRIMARY" ]]; then
            log "Rollback completed successfully"
            break
        fi

        if (( $(date +%s) - start_time > ROLLBACK_THRESHOLD )); then
            log "ERROR: Rollback timeout exceeded"
            exit 1
        fi

        sleep $HEALTH_CHECK_INTERVAL
    done
}

# Main execution
main() {
    local environment=$1
    local version=$2
    local component=$3
    local config_file=$4

    check_dependencies
    validate_environment "$environment"

    log "Starting deployment process for $component version $version in $environment"

    case "$component" in
        "backend")
            deploy_backend "$environment" "$version" "$config_file"
            ;;
        "frontend")
            deploy_frontend "$environment" "$version" "$config_file"
            ;;
        *)
            log "ERROR: Invalid component. Must be 'backend' or 'frontend'"
            exit 1
            ;;
    esac

    check_health "$environment" "${ECR_REPOSITORY}-${environment}" "$config_file"

    log "Deployment completed successfully"
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 3 ]]; then
        echo "Usage: $0 <environment> <version> <component> [config_file]"
        exit 1
    fi

    main "$@"
fi