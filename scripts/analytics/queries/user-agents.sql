-- user-agents: count of requests by User-Agent, descending. `is_bot` flags
-- common bot/crawler signatures so the operator can eyeball bot vs human
-- without filtering them out (raw list preserves the deeper picture).
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>       → <stack>.com-logs
--   <since_date>   → today - <days>, ISO YYYY-MM-DD
--   <since_ts>     → exact UTC cutoff (YYYY-MM-DD HH:MM:SS)

SELECT
	cs_User_Agent AS user_agent,
	COUNT(*)      AS hits,
	regexp_matches(
		LOWER(cs_User_Agent),
		'bot|crawler|spider|slurp|wget|curl|httpclient|httpx|python-requests|libwww|scrapy|headlesschrome'
	)             AS is_bot
FROM read_parquet(
	's3://<bucket>/AWSLogs/aws-account-id=*/CloudFront/cloudfront-access/*.parquet',
	hive_partitioning = true
)
WHERE date >= '<since_date>'
	AND date || ' ' || time >= '<since_ts>'
	AND cs_User_Agent IS NOT NULL
	AND cs_User_Agent <> '-'
GROUP BY 1
ORDER BY 2 DESC, 1
LIMIT 50;
