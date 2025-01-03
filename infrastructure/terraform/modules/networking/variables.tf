# Core Terraform functionality for variable definitions
# terraform ~> 1.0

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC network"
  
  validation {
    condition     = can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", var.vpc_cidr))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block (e.g., 10.0.0.0/16)."
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment identifier (dev/staging/prod)"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "List of AWS availability zones for multi-AZ deployment"
  
  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones must be specified for high availability."
  }
}

variable "public_subnet_cidrs" {
  type        = list(string)
  description = "CIDR blocks for public subnets hosting ALB and NAT gateways"
  
  validation {
    condition     = length(var.public_subnet_cidrs) >= 2
    error_message = "At least 2 public subnet CIDRs must be specified for high availability."
  }

  validation {
    condition     = alltrue([for cidr in var.public_subnet_cidrs : can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", cidr))])
    error_message = "All public subnet CIDRs must be valid IPv4 CIDR blocks."
  }
}

variable "private_subnet_cidrs" {
  type        = string
  description = "CIDR blocks for private subnets hosting ECS tasks and Lambda functions"
  
  validation {
    condition     = length(var.private_subnet_cidrs) >= 2
    error_message = "At least 2 private subnet CIDRs must be specified for high availability."
  }

  validation {
    condition     = alltrue([for cidr in var.private_subnet_cidrs : can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", cidr))])
    error_message = "All private subnet CIDRs must be valid IPv4 CIDR blocks."
  }
}

variable "isolated_subnet_cidrs" {
  type        = list(string)
  description = "CIDR blocks for isolated subnets hosting databases and OpenSearch"
  
  validation {
    condition     = length(var.isolated_subnet_cidrs) >= 2
    error_message = "At least 2 isolated subnet CIDRs must be specified for high availability."
  }

  validation {
    condition     = alltrue([for cidr in var.isolated_subnet_cidrs : can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", cidr))])
    error_message = "All isolated subnet CIDRs must be valid IPv4 CIDR blocks."
  }
}

variable "enable_nat_gateway" {
  type        = bool
  description = "Flag to enable NAT gateway for private subnet internet access"
  default     = true
}

variable "enable_vpn_gateway" {
  type        = bool
  description = "Flag to enable VPN gateway for secure remote access"
  default     = false
}

variable "tags" {
  type        = map(string)
  description = "Resource tags for cost allocation and resource management"
  default = {
    "Terraform"   = "true"
    "Application" = "agent-builder-hub"
  }
}