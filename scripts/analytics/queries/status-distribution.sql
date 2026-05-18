-- status-distribution: count of requests by HTTP status code over the
-- lookback window.
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>       → <stack>.com-logs
--   <since_date>   → today - <days>, ISO YYYY-MM-DD

SELECT
	sc_status::INT AS status,
	COUNT(*)       AS hits
FROM read_parquet(
	's3://<bucket>/AWSLogs/aws-account-id=*/CloudFront/cloudfront-access/*.parquet',
	hive_partitioning = true
)
WHERE date >= '<since_date>'
GROUP BY 1
ORDER BY 1;
