-- requests-over-time: total requests per day across the lookback window.
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>       → <stack>.com-logs
--   <since_date>   → today - <days>, ISO YYYY-MM-DD
--
-- `date` is VARCHAR (ISO YYYY-MM-DD), so GROUP BY on the raw column gives
-- one row per calendar day without a cast.

SELECT
	date     AS day,
	COUNT(*) AS hits
FROM read_parquet(
	's3://<bucket>/AWSLogs/aws-account-id=*/CloudFront/cloudfront-access/*.parquet',
	hive_partitioning = true
)
WHERE date >= '<since_date>'
GROUP BY 1
ORDER BY 1;
