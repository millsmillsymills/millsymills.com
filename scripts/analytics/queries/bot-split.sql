-- bot-split: automated vs human split with volume and error signal.
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>       → <stack>.com-logs
--   <since_date>   → UTC day-floor of the window
--   <since_ts>     → exact UTC cutoff (YYYY-MM-DD HH:MM:SS)
--
-- is_automated() is provided by scripts/analytics/lib/classify.sql, prepended
-- by run.sh (live) and lint-queries.sh (fake schema). Humans should skew 2xx;
-- a high 404 share is the scanner tell.

SELECT
	CASE WHEN is_automated(cs_User_Agent) THEN 'automated' ELSE 'human' END AS kind,
	COUNT(*)                                          AS requests,
	COUNT(DISTINCT c_ip)                              AS unique_ips,
	COUNT(*) FILTER (WHERE sc_status::INT BETWEEN 200 AND 299) AS ok_2xx,
	COUNT(*) FILTER (WHERE sc_status::INT = 404)      AS not_found_404
FROM read_parquet(
	's3://<bucket>/AWSLogs/aws-account-id=*/CloudFront/cloudfront-access/*.parquet',
	hive_partitioning = true
)
WHERE date >= '<since_date>'
	AND date || ' ' || time >= '<since_ts>'
GROUP BY 1
ORDER BY requests DESC;
