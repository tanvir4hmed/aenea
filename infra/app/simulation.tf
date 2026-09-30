resource "aws_iam_role_policy" "simulation_worker" {
  role = aws_iam_role.lambda["simulation_worker"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:ConditionCheckItem"], Resource = data.terraform_remote_state.data.outputs.table_arn },
      { Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = aws_lambda_function.function["ingest"].arn }
    ]
  })
}

resource "aws_iam_role_policy" "simulation_library" {
  role = aws_iam_role.lambda["action_executor"].id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["dynamodb:BatchWriteItem", "dynamodb:DeleteItem"], Resource = data.terraform_remote_state.data.outputs.table_arn }]
  })
}

resource "aws_cloudwatch_event_rule" "simulation" {
  name                = "aenea-simulation"
  description         = "Continue finite simulated device runs independently of browsers"
  schedule_expression = "rate(1 minute)"
}

resource "aws_cloudwatch_event_target" "simulation" {
  rule = aws_cloudwatch_event_rule.simulation.name
  arn  = aws_lambda_function.function["simulation_worker"].arn
}

resource "aws_lambda_permission" "simulation" {
  statement_id  = "AllowSimulationSchedule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.function["simulation_worker"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.simulation.arn
}
