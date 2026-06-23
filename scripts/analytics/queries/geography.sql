-- geography: requests and unique IPs by CloudFront edge POP, decoded to
-- city/country via the committed edge-locations.csv. Edge POP is a PROXY for
-- viewer region (the edge that served the request), NOT a geo-IP lookup —
-- CloudFront standard logs carry no viewer-country field.
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>       → <stack>.com-logs
--   <since_date>   → UTC day-floor of the window
--   <since_ts>     → exact UTC cutoff (YYYY-MM-DD HH:MM:SS)
--
-- Ordered by unique IPs, not requests: a single scanner can run up thousands
-- of requests from one IP (e.g. one Amsterdam host), so unique IPs is the
-- truer eyeball signal. Both columns shown so the skew is visible. Unknown
-- POP codes fall through to the raw 3-letter prefix via COALESCE.

SELECT
	COALESCE(g.city, '?') AS city,
	COALESCE(g.country, l.pop) AS country,
	l.pop AS pop,
	COUNT(*) AS requests,
	COUNT(DISTINCT l.c_ip) AS unique_ips
FROM (
	SELECT
		c_ip,
		regexp_extract(x_edge_location, '^[A-Z]+') AS pop
	FROM read_parquet(
		's3://<bucket>/AWSLogs/aws-account-id=*/CloudFront/cloudfront-access/*.parquet',
		hive_partitioning = true
	)
	WHERE date >= '<since_date>'
		AND date || ' ' || time >= '<since_ts>'
) l
LEFT JOIN read_csv('scripts/analytics/edge-locations.csv', header = true) g
	ON g.pop = l.pop
GROUP BY 1, 2, 3
ORDER BY unique_ips DESC, requests DESC
LIMIT 50;
