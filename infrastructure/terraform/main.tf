terraform {
  required_version = ">= 1.6.0"
  required_providers { aws = { source = "hashicorp/aws", version = "~> 5.0" } }
}

provider "aws" { region = var.aws_region }
provider "aws" { alias = "dr" region = var.dr_aws_region }

data "aws_availability_zones" "available" { state = "available" }

resource "aws_db_subnet_group" "devsync" {
  name = "${var.name}-db"
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_subnet_group" "dr" {
  provider = aws.dr
  name = "${var.name}-dr-db"
  subnet_ids = var.dr_private_subnet_ids
}

resource "aws_kms_key" "rds" {
  description = "DevSync primary-region RDS encryption key"
  multi_region = true
  enable_key_rotation = true
  deletion_window_in_days = 30
}

resource "aws_kms_replica_key" "rds_dr" {
  provider = aws.dr
  description = "DevSync DR-region RDS encryption key"
  primary_key_arn = aws_kms_key.rds.arn
  deletion_window_in_days = 30
}

resource "aws_security_group" "database" {
  name = "${var.name}-database"
  vpc_id = var.vpc_id
  ingress { from_port = 5432, to_port = 5432, protocol = "tcp", security_groups = [var.application_security_group_id] }
}

resource "aws_db_instance" "postgres" {
  identifier = "${var.name}-postgres"
  engine = "postgres"
  engine_version = "16.4"
  instance_class = var.db_instance_class
  allocated_storage = 100
  max_allocated_storage = 1000
  db_name = "devsync"
  username = var.db_username
  password = var.db_password
  port = 5432
  db_subnet_group_name = aws_db_subnet_group.devsync.name
  vpc_security_group_ids = [aws_security_group.database.id]
  multi_az = true
  backup_retention_period = 30
  backup_window = "03:00-03:30"
  maintenance_window = "sun:04:00-sun:04:30"
  deletion_protection = true
  storage_encrypted = true
  kms_key_id = aws_kms_key.rds.arn
  publicly_accessible = false
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.name}-final"
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
}

# Active-passive DR: asynchronous cross-region read replica.  Promotion is an
# explicit incident operation, preventing split-brain during a regional event.
resource "aws_security_group" "database_dr" {
  provider = aws.dr
  name = "${var.name}-database-dr"
  vpc_id = var.dr_vpc_id
  ingress { from_port = 5432, to_port = 5432, protocol = "tcp", security_groups = [var.dr_application_security_group_id] }
}

resource "aws_db_instance" "postgres_dr" {
  provider = aws.dr
  identifier = "${var.name}-postgres-dr"
  replicate_source_db = aws_db_instance.postgres.arn
  instance_class = var.dr_db_instance_class
  db_subnet_group_name = aws_db_subnet_group.dr.name
  vpc_security_group_ids = [aws_security_group.database_dr.id]
  publicly_accessible = false
  multi_az = true
  storage_encrypted = true
  kms_key_id = aws_kms_replica_key.rds_dr.arn
  backup_retention_period = 30
  backup_window = "03:30-04:00"
  maintenance_window = "sun:04:30-sun:05:00"
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.name}-dr-final"
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
}

resource "aws_elasticache_subnet_group" "devsync" { name = "${var.name}-redis" subnet_ids = var.private_subnet_ids }
resource "aws_security_group" "redis" {
  name = "${var.name}-redis"
  vpc_id = var.vpc_id
  ingress { from_port = 6379, to_port = 6379, protocol = "tcp", security_groups = [var.application_security_group_id] }
}
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.name}-redis"
  description = "DevSync multi-AZ Redis"
  engine = "redis"
  node_type = var.redis_node_type
  parameter_group_name = "default.redis7.cluster.on"
  port = 6379
  num_node_groups = 2
  replicas_per_node_group = 1
  automatic_failover_enabled = true
  multi_az_enabled = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token = var.redis_auth_token
  subnet_group_name = aws_elasticache_subnet_group.devsync.name
  security_group_ids = [aws_security_group.redis.id]
}

output "database_endpoint" { value = aws_db_instance.postgres.address }
output "dr_database_endpoint" { value = aws_db_instance.postgres_dr.address }
output "redis_endpoint" { value = aws_elasticache_replication_group.redis.configuration_endpoint_address }
