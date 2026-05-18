-- referrers: count of requests by Referer header, descending, excluding
-- same-origin navigations (where the Referer host matches cs_Host).
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>       → <stack>.com-logs
--   <since_date>   → today - <days>, ISO YYYY-MM-DD
--
-- CloudFront writes `-` for the Referer when the request didn't carry one;
-- that's not interesting traffic. Drop it alongside SQL NULL.

SELECT
	cs_Referer AS referer,
	COUNT(*)   AS hits
FROM read_parquet(
	's3://<bucket>/AWSLogs/aws-account-id=*/CloudFront/cloudfront-access/*.parquet',
	hive_partitioning = true
)
WHERE date >= '<since_date>'
	AND cs_Referer IS NOT NULL
	AND cs_Referer <> '-'
	AND NOT (
		cs_Referer LIKE 'http://' || cs_Host || '/%'
		OR cs_Referer LIKE 'https://' || cs_Host || '/%'
		OR cs_Referer = 'http://' || cs_Host
		OR cs_Referer = 'https://' || cs_Host
	)
GROUP BY 1
ORDER BY 2 DESC, 1
LIMIT 50;
