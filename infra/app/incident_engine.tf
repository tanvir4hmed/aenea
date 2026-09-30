resource "aws_iam_role_policy" "incident_assignment" {
  role = aws_iam_role.lambda["ingest"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["dynamodb:ConditionCheckItem"], Resource = data.terraform_remote_state.data.outputs.table_arn },
      { Effect = "Allow", Action = ["bedrock-agentcore:InvokeAgentRuntime"], Resource = [data.terraform_remote_state.reasoner.outputs.runtime_arn, "${data.terraform_remote_state.reasoner.outputs.runtime_arn}/runtime-endpoint/*"] }
    ]
  })
}

resource "aws_iam_role_policy" "incident_reassessment" {
  role = aws_iam_role.lambda["action_executor"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["events:PutEvents"], Resource = data.terraform_remote_state.platform.outputs.event_bus_arn },
      { Effect = "Allow", Action = ["bedrock-agentcore:InvokeAgentRuntime"], Resource = [data.terraform_remote_state.reasoner.outputs.runtime_arn, "${data.terraform_remote_state.reasoner.outputs.runtime_arn}/runtime-endpoint/*"] }
    ]
  })
}
