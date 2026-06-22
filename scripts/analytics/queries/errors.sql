-- errors: 4xx/5xx URIs over the lookback window, with hit count and a
-- representative status code, sorted by frequency.
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>       → <stack>.com-logs
--   <since_date>   → today - <days>, ISO YYYY-MM-DD
--   <since_ts>     → exact UTC cutoff (YYYY-MM-DD HH:MM:SS)
--
-- sc_status is VARCHAR in the v2 schema; cast to INT for the >= 400 range
-- compare. The cast is also why mode() needs the INT input — mode over
-- VARCHAR returns lexically-largest-tie, not numerically-largest.

SELECT
	cs_uri_stem            AS path,
	COUNT(*)               AS hits,
	mode(sc_status::INT)   AS sample_status
FROM read_parquet(
	's3://<bucket>/AWSLogs/aws-account-id=*/CloudFront/cloudfront-access/*.parquet',
	hive_partitioning = true
)
WHERE date >= '<since_date>'
	AND date || ' ' || time >= '<since_ts>'
	AND sc_status::INT >= 400
GROUP BY 1
ORDER BY 2 DESC, 1
LIMIT 100;
