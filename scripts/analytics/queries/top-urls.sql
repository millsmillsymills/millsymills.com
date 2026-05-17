-- top-urls: which URLs got the most requests in the lookback window.
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>       → <stack>.com-logs
--   <since_date>   → today - <days>, ISO YYYY-MM-DD
--
-- CloudFront standard-logs v2 Parquet only carries `aws-account-id` as a
-- hive partition; year/month/day are not partition columns. Each row's
-- date is in the (varchar) `date` column as ISO YYYY-MM-DD, so a lexical
-- comparison against the cutoff is correct. DuckDB pushes the predicate
-- into the Parquet reader and skips row groups whose `date` min/max
-- bounds fall outside the window — that's where the speedup comes from
-- at this scale rather than from partition pruning.

SELECT
	cs_uri_stem AS path,
	COUNT(*)    AS hits
FROM read_parquet(
	's3://<bucket>/AWSLogs/aws-account-id=*/CloudFront/cloudfront-access/*.parquet',
	hive_partitioning = true
)
WHERE date >= '<since_date>'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 50;
