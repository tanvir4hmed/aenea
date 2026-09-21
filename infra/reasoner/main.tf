terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "= 6.65.0" }
  }
  backend "s3" {}
}

variable "region" { type = string }
variable "state_bucket" { type = string }
variable "bedrock_model_id" {
  type    = string
  default = "amazon.nova-lite-v1:0"
  validation {
    condition     = can(regex("^amazon\\.nova-[a-z0-9:.-]+$", var.bedrock_model_id))
    error_message = "Use an Amazon Nova foundation model ID; update IAM explicitly for another provider."
  }
}
provider "aws" {
  region = var.region
  default_tags { tags = { Project = "Aenea", Name = "Aenea", Environment = "development", ManagedBy = "Terraform", Repository = "tanvir4hmed/aenea", Lifecycle = "Hackathon2026" } }
}
data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "code" {
  bucket = "aenea-${data.aws_caller_identity.current.account_id}-reasoner-code"
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
  key         = "reasoner/${filesha256("${path.module}/../../.artifacts/reasoner.zip")}.zip"
  source      = "${path.module}/../../.artifacts/reasoner.zip"
  source_hash = filesha256("${path.module}/../../.artifacts/reasoner.zip")
}
resource "aws_iam_role" "reasoner" {
  name = "aenea-reasoner"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow", Principal = { Service = "bedrock-agentcore.amazonaws.com" },
      Action = "sts:AssumeRole",
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:bedrock-agentcore:${var.region}:${data.aws_caller_identity.current.account_id}:runtime/aenea_reasoner*" }
      }
    }]
  })
}
resource "aws_iam_role_policy" "reasoner" {
  role = aws_iam_role.reasoner.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      Resource = "arn:aws:bedrock:${var.region}::foundation-model/${var.bedrock_model_id}" },
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.code.arn}/reasoner/*" },
      { Effect = "Allow", Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams", "logs:PutResourcePolicy"],
      Resource = "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/aenea_reasoner*" },
      { Effect = "Allow", Action = ["logs:DescribeLogGroups"], Resource = "*" },
      { Effect = "Allow", Action = ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets"], Resource = "*" },
      { Effect = "Allow", Action = ["cloudwatch:PutMetricData"], Resource = "*",
      Condition = { StringEquals = { "cloudwatch:namespace" = "bedrock-agentcore" } } }
    ]
  })
}
resource "aws_bedrockagentcore_agent_runtime" "reasoner" {
  agent_runtime_name = "aenea_reasoner"
  role_arn           = aws_iam_role.reasoner.arn
  description        = "Aenea evidence assessment. No device execution permissions."
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
  protocol_configuration { server_protocol = "HTTP" }
  lifecycle_configuration {
    idle_runtime_session_timeout = 60
    max_lifetime                 = 900
  }
  environment_variables = { BEDROCK_MODEL_ID = var.bedrock_model_id }
  depends_on            = [aws_iam_role_policy.reasoner, aws_s3_bucket_public_access_block.code]
}
output "runtime_arn" { value = aws_bedrockagentcore_agent_runtime.reasoner.agent_runtime_arn }
output "runtime_id" { value = aws_bedrockagentcore_agent_runtime.reasoner.agent_runtime_id }
