#!/bin/bash

# AWS Monitoring Infrastructure Management Script
# Version: 1.0.0
# Dependencies: aws-cli v2.0+, jq v1.6+

set -euo pipefail

# Global variables
AWS_REGION=${AWS_REGION:-"us-west-2"}
PROJECT_NAME=${PROJECT_NAME:-"agent-builder-hub"}
ENVIRONMENT=${ENVIRONMENT:-"dev"}
LOG_RETENTION_DAYS=${LOG_RETENTION_DAYS:-30}
METRIC_NAMESPACE="AgentBuilderHub"

# Utility functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

check_dependencies() {
    command -v aws >/dev/null 2>&1 || { echo "AWS CLI is required but not installed. Aborting." >&2; exit 1; }
    command -v jq >/dev/null 2>&1 || { echo "jq is required but not installed. Aborting." >&2; exit 1; }
}

validate_environment() {
    if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
        log "ERROR: Invalid environment. Must be dev, staging, or prod"
        exit 1
    }
}

setup_cloudwatch_dashboard() {
    local environment=$1
    local dashboard_name=$2
    local service_list=$3

    log "Creating CloudWatch dashboard: $dashboard_name"

    # Generate dashboard JSON template
    cat > dashboard.json <<EOF
{
    "widgets": [
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    ["${METRIC_NAMESPACE}", "APILatency", "Environment", "${environment}"],
                    ["${METRIC_NAMESPACE}", "ProcessingTime", "Environment", "${environment}"]
                ],
                "period": 60,
                "stat": "Average",
                "region": "${AWS_REGION}",
                "title": "API Performance"
            }
        },
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    ["AWS/ECS", "CPUUtilization", "ClusterName", "${PROJECT_NAME}-${environment}"],
                    ["AWS/ECS", "MemoryUtilization", "ClusterName", "${PROJECT_NAME}-${environment}"]
                ],
                "period": 300,
                "stat": "Average",
                "region": "${AWS_REGION}",
                "title": "Resource Utilization"
            }
        },
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    ["AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", "${PROJECT_NAME}-${environment}"],
                    ["AWS/DynamoDB", "ThrottledRequests", "TableName", "${PROJECT_NAME}-${environment}"]
                ],
                "period": 60,
                "stat": "Average",
                "region": "${AWS_REGION}",
                "title": "Database Performance"
            }
        }
    ]
}
EOF

    # Deploy dashboard using AWS CLI
    aws cloudwatch put-dashboard \
        --dashboard-name "${dashboard_name}" \
        --dashboard-body "$(cat dashboard.json)"

    log "Dashboard created successfully"
    return 0
}

configure_alarms() {
    local environment=$1
    local service_name=$2
    local alarm_config_file=$3

    log "Configuring CloudWatch alarms for $service_name"

    # API Latency Alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "${service_name}-api-latency" \
        --alarm-description "API latency exceeds threshold" \
        --metric-name "APILatency" \
        --namespace "${METRIC_NAMESPACE}" \
        --statistic Average \
        --period 60 \
        --threshold 100 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 3 \
        --alarm-actions "arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:${PROJECT_NAME}-${environment}-alerts"

    # Error Rate Alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "${service_name}-error-rate" \
        --alarm-description "Error rate exceeds threshold" \
        --metric-name "ErrorCount" \
        --namespace "${METRIC_NAMESPACE}" \
        --statistic Sum \
        --period 300 \
        --threshold 1 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions "arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:${PROJECT_NAME}-${environment}-alerts"

    log "Alarms configured successfully"
    return 0
}

setup_log_insights() {
    local log_group_name=$1
    local query_config_file=$2

    log "Setting up CloudWatch Log Insights for $log_group_name"

    # Create performance monitoring query
    aws logs put-query-definition \
        --name "api-performance-analysis" \
        --query-string "fields @timestamp, @message | filter @message like /API request/ | stats avg(duration) as avg_latency by requestId" \
        --log-group-names "${log_group_name}"

    # Create error tracking query
    aws logs put-query-definition \
        --name "error-analysis" \
        --query-string "fields @timestamp, @message | filter @message like /ERROR/ | stats count(*) as error_count by errorType" \
        --log-group-names "${log_group_name}"

    log "Log Insights queries configured successfully"
    return 0
}

configure_xray() {
    local service_name=$1
    local sampling_rate=$2
    local trace_config_file=$3

    log "Configuring X-Ray tracing for $service_name"

    # Create sampling rule
    aws xray create-sampling-rule \
        --sampling-rule '{
            "RuleName": "'${service_name}'-sampling",
            "Priority": 1000,
            "FixedRate": '${sampling_rate}',
            "ReservoirSize": 60,
            "ServiceName": "'${service_name}'",
            "ServiceType": "*",
            "Host": "*",
            "HTTPMethod": "*",
            "URLPath": "*",
            "Version": 1
        }'

    log "X-Ray tracing configured successfully"
    return 0
}

# Main execution
main() {
    check_dependencies
    validate_environment

    log "Starting monitoring setup for environment: $ENVIRONMENT"

    # Setup CloudWatch dashboard
    setup_cloudwatch_dashboard "$ENVIRONMENT" "${PROJECT_NAME}-${ENVIRONMENT}-dashboard" "api,ecs,lambda"

    # Configure alarms
    configure_alarms "$ENVIRONMENT" "${PROJECT_NAME}" "alarm-config.json"

    # Setup Log Insights
    setup_log_insights "/aws/lambda/${PROJECT_NAME}-${ENVIRONMENT}" "query-config.json"

    # Configure X-Ray
    configure_xray "${PROJECT_NAME}-${ENVIRONMENT}" 0.05 "trace-config.json"

    log "Monitoring setup completed successfully"
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi