data "aws_caller_identity" "app" {}

resource "aws_iam_role_policy" "mcp_tools" {
  role = aws_iam_role.lambda["mcp_tools"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:ConditionCheckItem"]
      Resource = data.terraform_remote_state.data.outputs.table_arn
    }]
  })
}
resource "aws_iam_role_policy" "mcp_proxy" {
  role = aws_iam_role.lambda["mcp_proxy"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.app.account_id}:parameter/aenea/${var.environment}/mcp/runtime-arn"
    }]
  })
}
output "tools_function_arn" { value = aws_lambda_function.function["mcp_tools"].arn }
