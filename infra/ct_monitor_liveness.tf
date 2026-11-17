# Preserve the existing, state-managed liveness alarm at its current address.
# Successful invocations = invocations minus errors, with missing points filled
# as zero so a stopped schedule is not mistaken for a healthy quiet monitor.
# Keep the existing 26-period window unchanged during source reconciliation.
resource "aws_cloudwatch_metric_alarm" "ct_monitor_no_success" {
  count = var.enable_ct_monitor ? 1 : 0

  alarm_name          = "${local.ct_name}-no-success"
  alarm_description   = "CT monitor has had no successful Lambda invocation for 26 hourly periods. Check the EventBridge schedule and Lambda logs; certificate monitoring may be unavailable."
  actions_enabled     = true
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 26
  datapoints_to_alarm = 26
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.ct_monitor[0].arn]
  ok_actions          = [aws_sns_topic.ct_monitor[0].arn]

  metric_query {
    id          = "errors"
    return_data = false
    metric {
      metric_name = "Errors"
      namespace   = "AWS/Lambda"
      period      = 3600
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.ct_monitor[0].function_name
      }
    }
  }

  metric_query {
    id          = "invocations"
    return_data = false
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 3600
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.ct_monitor[0].function_name
      }
    }
  }

  metric_query {
    id          = "successes"
    expression  = "FILL(invocations, 0) - FILL(errors, 0)"
    label       = "Successful CT monitor invocations"
    return_data = true
  }
}
