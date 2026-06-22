-- device-split: requests and unique IPs by inferred device class.
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>       → <stack>.com-logs
--   <since_date>   → UTC day-floor of the window
--   <since_ts>     → exact UTC cutoff (YYYY-MM-DD HH:MM:SS)
--
-- First-match-wins. Tablet is checked BEFORE mobile because Android tablet
-- UAs carry "Android" but omit "Mobile"; a mobile-first order would
-- misclassify them. UA-class inference is a heuristic — iPadOS Safari, which
-- masquerades as desktop Macintosh, is a known blind spot.

SELECT
	CASE
		WHEN is_automated(cs_User_Agent) THEN 'bot'
		WHEN regexp_matches(cs_User_Agent, 'iPad|Tablet')
			OR (cs_User_Agent LIKE '%Android%' AND cs_User_Agent NOT LIKE '%Mobile%') THEN 'tablet'
		WHEN regexp_matches(cs_User_Agent, 'Mobi|iPhone|iPod|Android') THEN 'mobile'
		ELSE 'desktop'
	END AS device,
	COUNT(*) AS requests,
	COUNT(DISTINCT c_ip) AS unique_ips
FROM read_parquet(
	's3://<bucket>/AWSLogs/aws-account-id=*/CloudFront/cloudfront-access/*.parquet',
	hive_partitioning = true
)
WHERE date >= '<since_date>'
	AND date || ' ' || time >= '<since_ts>'
GROUP BY 1
ORDER BY requests DESC;
