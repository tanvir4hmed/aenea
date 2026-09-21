data "terraform_remote_state" "reasoner" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "reasoner/terraform.tfstate"
    region = var.region
  }
}

resource "aws_iam_role_policy" "coordination" {
  for_each = toset(["invoke_reasoner", "policy", "action_executor"])
  role     = aws_iam_role.lambda[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:ConditionCheckItem"]
        Resource = data.terraform_remote_state.data.outputs.table_arn
      }
    ]
  })
}
resource "aws_iam_role_policy" "invoke_reasoner" {
  role = aws_iam_role.lambda["invoke_reasoner"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["bedrock-agentcore:InvokeAgentRuntime"]
      Resource = [data.terraform_remote_state.reasoner.outputs.runtime_arn,
      "${data.terraform_remote_state.reasoner.outputs.runtime_arn}/runtime-endpoint/*"]
    }]
  })
}
