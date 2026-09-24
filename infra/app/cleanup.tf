resource "aws_iam_role_policy" "cleanup" {
  role = aws_iam_role.lambda["cleanup"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:BatchWriteItem"]
        Resource = data.terraform_remote_state.data.outputs.table_arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucketVersions"]
        Resource = data.terraform_remote_state.data.outputs.evidence_arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:DeleteObject", "s3:DeleteObjectVersion"]
        Resource = "${data.terraform_remote_state.data.outputs.evidence_arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "correlate_deletion_guard" {
  role = aws_iam_role.lambda["correlate"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:ConditionCheckItem"]
      Resource = data.terraform_remote_state.data.outputs.table_arn
    }]
  })
}

resource "aws_cloudwatch_event_rule" "cleanup" {
  name                = "aenea-cleanup"
  description         = "Retry explicitly requested incident cleanup after the drain window"
  schedule_expression = "rate(5 minutes)"
}

resource "aws_cloudwatch_event_target" "cleanup" {
  rule = aws_cloudwatch_event_rule.cleanup.name
  arn  = aws_lambda_function.function["cleanup"].arn
}

resource "aws_lambda_permission" "cleanup_schedule" {
  statement_id  = "AllowCleanupSchedule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.function["cleanup"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cleanup.arn
}
