# Output definitions for the networking module exposing VPC, subnet, and security group resources
# for secure and organized access to networking components

# VPC Outputs
output "vpc_id" {
  description = "ID of the created VPC for resource placement and network association"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC for network planning and security group rules"
  value       = aws_vpc.main.cidr_block
}

# Subnet Outputs
output "public_subnet_ids" {
  description = "List of public subnet IDs for ALB and NAT gateway deployment across availability zones"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs for ECS tasks and Lambda functions with high availability"
  value       = aws_subnet.private[*].id
}

output "isolated_subnet_ids" {
  description = "List of isolated subnet IDs for secure database and OpenSearch deployment"
  value       = aws_subnet.isolated[*].id
}

# Security Group Outputs
output "alb_security_group_id" {
  description = "Security group ID for the Application Load Balancer and WAF configuration"
  value       = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  description = "Security group ID for ECS container tasks and services"
  value       = aws_security_group.ecs.id
}

output "db_security_group_id" {
  description = "Security group ID for database instances with restricted access"
  value       = aws_security_group.db.id
}