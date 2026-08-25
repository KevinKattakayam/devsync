variable "aws_region" { type = string }
variable "dr_aws_region" { type = string }
variable "name" { type = string, default = "devsync-prod" }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "dr_private_subnet_ids" { type = list(string) }
variable "dr_vpc_id" { type = string }
variable "application_security_group_id" { type = string }
variable "dr_application_security_group_id" { type = string }
variable "db_username" { type = string, sensitive = true }
variable "db_password" { type = string, sensitive = true }
variable "redis_auth_token" { type = string, sensitive = true }
variable "db_instance_class" { type = string, default = "db.r6g.large" }
variable "dr_db_instance_class" { type = string, default = "db.r6g.large" }
variable "redis_node_type" { type = string, default = "cache.r6g.large" }
