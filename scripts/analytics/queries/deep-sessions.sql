-- deep-sessions: human visitors whose browser actually ran the desktop app,
-- measured by distinct /_astro/*.js bundles fetched. A bare "/" hit that
-- bounced fetches few-to-no bundles; a real session pulls many.
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>       → <stack>.com-logs
--   <since_date>   → UTC day-floor of the window
--   <since_ts>     → exact UTC cutoff (YYYY-MM-DD HH:MM:SS)
--
-- MIN_ASTRO = 3 (the HAVING threshold) is a documented heuristic — raise it
-- for a stricter "fully ran the app" cut. BEST-EFFORT: a scanner spoofing a
-- browser UA that also fetches assets can still appear here; is_automated()
-- only filters declared bots. Per-IP, not per-session (no cookies in logs).

WITH human AS (
	SELECT *
	FROM read_parquet(
		's3://<bucket>/AWSLogs/aws-account-id=*/CloudFront/cloudfront-access/*.parquet',
		hive_partitioning = true
	)
	WHERE date >= '<since_date>'
		AND date || ' ' || time >= '<since_ts>'
		AND NOT is_automated(cs_User_Agent)
)
SELECT
	c_ip,
	COUNT(DISTINCT CASE WHEN cs_uri_stem LIKE '/_astro/%.js' THEN cs_uri_stem END) AS astro_assets,
	COUNT(DISTINCT cs_uri_stem) AS distinct_paths,
	COUNT(*) AS hits,
	any_value(regexp_extract(x_edge_location, '^[A-Z]+')) AS pop,
	MIN(date || ' ' || time) AS first_seen,
	MAX(date || ' ' || time) AS last_seen
FROM human
GROUP BY c_ip
HAVING astro_assets >= 3
ORDER BY astro_assets DESC, hits DESC
LIMIT 50;
