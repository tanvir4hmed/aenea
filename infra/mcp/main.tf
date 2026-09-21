terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "= 6.65.0" }
  }
  backend "s3" {}
}
variable "region" { type = string }
variable "environment" { default = "demo" }
variable "state_bucket" { type = string }
provider "aws" {
  region = var.region
  default_tags { tags = { Project = "Aenea", Environment = var.environment } }
}
data "aws_caller_identity" "current" {}
data "terraform_remote_state" "platform" {
  backend = "s3"
  config  = { bucket = var.state_bucket, key = "platform/terraform.tfstate", region = var.region }
}
data "terraform_remote_state" "app" {
  backend = "s3"
  config  = { bucket = var.state_bucket, key = "app/terraform.tfstate", region = var.region }
}
locals {
  issuer       = "https://cognito-idp.${var.region}.amazonaws.com/${data.terraform_remote_state.platform.outputs.user_pool_id}"
  resource_url = "${data.terraform_remote_state.platform.outputs.web_config.apiUrl}/mcp"
}
resource "aws_s3_bucket" "code" {
  bucket = "aenea-${var.environment}-${data.aws_caller_identity.current.account_id}-mcp-code"
}
resource "aws_s3_bucket_public_access_block" "code" {
  bucket                  = aws_s3_bucket.code.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "code" {
  bucket = aws_s3_bucket.code.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_object" "code" {
  bucket      = aws_s3_bucket.code.id
  key         = "mcp/${filesha256("${path.module}/../../.artifacts/mcp.zip")}.zip"
  source      = "${path.module}/../../.artifacts/mcp.zip"
  source_hash = filesha256("${path.module}/../../.artifacts/mcp.zip")
}
resource "aws_iam_role" "mcp" {
  name = "aenea-${var.environment}-mcp"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "bedrock-agentcore.amazonaws.com" },
      Action = "sts:AssumeRole", Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:bedrock-agentcore:${var.region}:${data.aws_caller_identity.current.account_id}:runtime/aenea_${var.environment}_mcp*" }
      }
    }]
  })
}
resource "aws_iam_role_policy" "mcp" {
  role = aws_iam_role.mcp.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = data.terraform_remote_state.app.outputs.tools_function_arn },
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.code.arn}/mcp/*" },
      { Effect = "Allow", Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams", "logs:PutResourcePolicy"],
      Resource = "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/aenea_${var.environment}_mcp*" },
      { Effect = "Allow", Action = ["logs:DescribeLogGroups"], Resource = "*" }
    ]
  })
}
resource "aws_bedrockagentcore_agent_runtime" "mcp" {
  agent_runtime_name = "aenea_${var.environment}_mcp"
  role_arn           = aws_iam_role.mcp.arn
  agent_runtime_artifact {
    code_configuration {
      entry_point = ["main.py"]
      runtime     = "PYTHON_3_12"
      code {
        s3 {
          bucket = aws_s3_object.code.bucket
          prefix = aws_s3_object.code.key
        }
      }
    }
  }
  network_configuration { network_mode = "PUBLIC" }
  protocol_configuration { server_protocol = "MCP" }
  authorizer_configuration {
    custom_jwt_authorizer {
      discovery_url   = "${local.issuer}/.well-known/openid-configuration"
      allowed_clients = [data.terraform_remote_state.platform.outputs.web_config.clientId]
      allowed_scopes  = ["aenea/read"]
    }
  }
  request_header_configuration { request_header_allowlist = ["Authorization"] }
  environment_variables = {
    COGNITO_ISSUER     = local.issuer
    COGNITO_CLIENT_ID  = data.terraform_remote_state.platform.outputs.web_config.clientId
    MCP_RESOURCE_URL   = local.resource_url
    TOOLS_FUNCTION_ARN = data.terraform_remote_state.app.outputs.tools_function_arn
  }
  lifecycle_configuration {
    idle_runtime_session_timeout = 60
    max_lifetime                 = 900
  }
  depends_on = [aws_iam_role_policy.mcp, aws_s3_bucket_public_access_block.code]
}
resource "aws_ssm_parameter" "runtime" {
  name  = "/aenea/${var.environment}/mcp/runtime-arn"
  type  = "String"
  value = aws_bedrockagentcore_agent_runtime.mcp.agent_runtime_arn
}
output "mcp_url" { value = local.resource_url }
output "runtime_arn" { value = aws_bedrockagentcore_agent_runtime.mcp.agent_runtime_arn }
