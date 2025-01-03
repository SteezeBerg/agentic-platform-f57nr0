#!/bin/bash

# AWS Security Infrastructure Management Script
# Version: 1.0.0
# Dependencies: aws-cli v2.0+, jq v1.6+

set -euo pipefail

# Import monitoring functions
source ./monitoring.sh

# Global variables
AWS_REGION=${AWS_REGION:-"us-west-2"}
ENVIRONMENTS=${ENVIRONMENTS:-"dev staging prod"}
WAF_RATE_LIMIT=${WAF_RATE_LIMIT:-10000}
KMS_KEY_ROTATION_DAYS=${KMS_KEY_ROTATION_DAYS:-365}
ML_MODEL_UPDATE_FREQUENCY=${ML_MODEL_UPDATE_FREQUENCY:-7}
COMPLIANCE_REPORT_SCHEDULE=${COMPLIANCE_REPORT_SCHEDULE:-"daily"}

# Utility functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

check_dependencies() {
    command -v aws >/dev/null 2>&1 || { echo "AWS CLI is required but not installed. Aborting." >&2; exit 1; }
    command -v jq >/dev/null 2>&1 || { echo "jq is required but not installed. Aborting." >&2; exit 1; }
}

validate_environment() {
    if [[ ! "$1" =~ ^(dev|staging|prod)$ ]]; then
        log "ERROR: Invalid environment. Must be dev, staging, or prod"
        exit 1
    fi
}

configure_waf() {
    local environment=$1
    local web_acl_name=$2

    log "Configuring WAF for environment: $environment"

    # Create WAF web ACL
    aws wafv2 create-web-acl \
        --name "$web_acl_name" \
        --scope REGIONAL \
        --default-action Block={} \
        --description "WAF rules for Agent Builder Hub" \
        --rules file://waf-rules.json \
        --visibility-config \
            SampledRequestsEnabled=true,\
            CloudWatchMetricsEnabled=true,\
            MetricName="${web_acl_name}-metrics"

    # Configure rate limiting
    aws wafv2 update-rule-group \
        --name "${web_acl_name}-rate-limit" \
        --scope REGIONAL \
        --rules "[{
            \"Name\": \"RateLimit\",
            \"Priority\": 1,
            \"Statement\": {
                \"RateBasedStatement\": {
                    \"Limit\": ${WAF_RATE_LIMIT},
                    \"AggregateKeyType\": \"IP\"
                }
            },
            \"Action\": {
                \"Block\": {}
            },
            \"VisibilityConfig\": {
                \"SampledRequestsEnabled\": true,
                \"CloudWatchMetricsEnabled\": true,
                \"MetricName\": \"${web_acl_name}-rate-limit\"
            }
        }]"

    # Enable ML-based anomaly detection
    aws wafv2 put-logging-configuration \
        --logging-configuration \
            ResourceArn="arn:aws:wafv2:${AWS_REGION}:${AWS_ACCOUNT_ID}:regional/webacl/${web_acl_name}" \
            LogDestinationConfigs="arn:aws:firehose:${AWS_REGION}:${AWS_ACCOUNT_ID}:deliverystream/${web_acl_name}-logs"

    log "WAF configuration completed for $environment"
    return 0
}

setup_kms() {
    local environment=$1
    local key_alias=$2

    log "Setting up KMS encryption for environment: $environment"

    # Create KMS key with enhanced policy
    aws kms create-key \
        --description "KMS key for Agent Builder Hub ${environment}" \
        --policy file://kms-policy.json \
        --tags TagKey=Environment,TagValue=$environment

    # Configure key rotation
    aws kms enable-key-rotation \
        --key-id $key_id

    # Set up key aliases
    aws kms create-alias \
        --alias-name "alias/${key_alias}" \
        --target-key-id $key_id

    # Enable key usage auditing
    aws kms put-key-policy \
        --key-id $key_id \
        --policy-name default \
        --policy file://kms-audit-policy.json

    log "KMS setup completed for $environment"
    return 0
}

configure_security_monitoring() {
    local environment=$1

    log "Setting up security monitoring for environment: $environment"

    # Enable GuardDuty with ML models
    aws guardduty create-detector \
        --enable \
        --finding-publishing-frequency FIFTEEN_MINUTES \
        --data-sources S3Logs={Enable=true},Kubernetes={Enable=true},MalwareProtection={Enable=true}

    # Configure Security Hub
    aws securityhub enable-security-hub \
        --enable-default-standards \
        --control-finding-generator SECURITY_CONTROL \
        --tags Environment=$environment

    # Set up CloudTrail
    aws cloudtrail create-trail \
        --name "${environment}-security-trail" \
        --s3-bucket-name "${environment}-security-logs" \
        --is-multi-region-trail \
        --enable-log-file-validation \
        --kms-key-id $key_id

    # Configure ML-based threat detection
    aws cloudwatch put-metric-alarm \
        --alarm-name "${environment}-threat-detection" \
        --metric-name SecurityAnomalyScore \
        --namespace AWS/SecurityHub \
        --statistic Maximum \
        --period 300 \
        --threshold 7.0 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions "arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:security-alerts"

    log "Security monitoring configured for $environment"
    return 0
}

configure_incident_response() {
    local environment=$1

    log "Setting up incident response for environment: $environment"

    # Configure EventBridge rules for security events
    aws events put-rule \
        --name "${environment}-security-events" \
        --event-pattern file://security-event-pattern.json \
        --state ENABLED

    # Set up ML-enhanced Lambda response
    aws lambda create-function \
        --function-name "${environment}-security-response" \
        --runtime python3.11 \
        --handler index.handler \
        --role "arn:aws:iam::${AWS_ACCOUNT_ID}:role/security-response-role" \
        --code S3Bucket=security-functions,S3Key=response-handler.zip \
        --environment Variables={ENVIRONMENT=$environment}

    # Configure automated remediation
    aws ssm create-document \
        --name "${environment}-security-playbook" \
        --content file://security-playbook.json \
        --document-type Automation

    # Enable automated forensics
    aws securityhub enable-security-hub-administrator-account \
        --admin-account-id "${AWS_ACCOUNT_ID}"

    log "Incident response setup completed for $environment"
    return 0
}

# Main execution
main() {
    check_dependencies

    for env in $ENVIRONMENTS; do
        validate_environment "$env"
        
        log "Starting security setup for environment: $env"
        
        # Configure WAF
        configure_waf "$env" "${env}-web-acl"
        
        # Setup KMS encryption
        setup_kms "$env" "${env}-encryption-key"
        
        # Configure security monitoring
        configure_security_monitoring "$env"
        
        # Setup incident response
        configure_incident_response "$env"
        
        # Configure monitoring dashboards for security metrics
        setup_cloudwatch_dashboard "$env" "${env}-security-dashboard" "waf,guardduty,securityhub"
        
        # Configure security alarms
        configure_alarms "$env" "security" "security-alarm-config.json"
        
        log "Security setup completed for environment: $env"
    done
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi