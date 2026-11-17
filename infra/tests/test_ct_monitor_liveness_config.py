"""Offline guard for the existing CT liveness alarm's Terraform contract.

Structural checks complement terraform validate and a reviewed full live plan;
these do not emulate CloudWatch or prove production convergence.
"""
import re
import unittest
from pathlib import Path


class CTMonitorLivenessConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (Path(__file__).resolve().parents[1] / "ct_monitor_liveness.tf").read_text()

    def assert_setting(self, key, value):
        self.assertRegex(self.source, rf"(?m)^\s*{re.escape(key)}\s*=\s*{re.escape(value)}\s*$")

    def test_preserves_state_address_and_feature_gate(self):
        self.assertIn('resource "aws_cloudwatch_metric_alarm" "ct_monitor_no_success" {', self.source)
        self.assert_setting("count", "var.enable_ct_monitor ? 1 : 0")
        self.assert_setting("alarm_name", '"${local.ct_name}-no-success"')

    def test_preserves_existing_threshold_window_and_actions(self):
        for key, value in {
            "actions_enabled": "true",
            "comparison_operator": '"LessThanThreshold"',
            "evaluation_periods": "26",
            "datapoints_to_alarm": "26",
            "threshold": "1",
            "treat_missing_data": '"breaching"',
            "alarm_actions": "[aws_sns_topic.ct_monitor[0].arn]",
            "ok_actions": "[aws_sns_topic.ct_monitor[0].arn]",
        }.items():
            self.assert_setting(key, value)

    def test_success_metric_covers_missing_and_failed_runs(self):
        blocks = self.source.split("metric_query {")[1:]
        self.assertEqual(len(blocks), 3)
        for block, query_id, metric in zip(blocks[:2], ("errors", "invocations"), ("Errors", "Invocations")):
            for key, value in {"id": f'"{query_id}"', "metric_name": f'"{metric}"', "namespace": '"AWS/Lambda"', "period": "3600", "stat": '"Sum"', "return_data": "false", "FunctionName": "aws_lambda_function.ct_monitor[0].function_name"}.items():
                self.assertRegex(block, rf"(?m)^\s*{re.escape(key)}\s*=\s*{re.escape(value)}\s*$")
        self.assertRegex(blocks[2], r'id\s*=\s*"successes"')
        self.assertRegex(blocks[2], r'label\s*=\s*"Successful CT monitor invocations"')
        self.assertIn('"FILL(invocations, 0) - FILL(errors, 0)"', blocks[2])
        self.assertRegex(blocks[2], r"return_data\s*=\s*true")
        self.assertNotIn("ignore_changes", self.source)
        self.assertNotIn("prevent_destroy", self.source)


if __name__ == "__main__":
    unittest.main()
