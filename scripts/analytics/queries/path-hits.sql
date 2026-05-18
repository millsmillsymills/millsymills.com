-- path-hits: count of requests whose URI stem starts with <path>, grouped
-- by exact stem so the operator can see which sub-paths drove the hits.
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>       → <stack>.com-logs
--   <since_date>   → today - <days>, ISO YYYY-MM-DD
--   <path>         → positional arg after [days], e.g. /demo/passkey/
--
-- The `LIKE '<path>%'` form is a prefix match on cs_uri_stem (no query
-- string, no host). Pass a trailing slash if you want directory semantics;
-- pass without if you want any URI starting with that string.

SELECT
	cs_uri_stem AS path,
	COUNT(*)    AS hits
FROM read_parquet(
	's3://<bucket>/AWSLogs/aws-account-id=*/CloudFront/cloudfront-access/*.parquet',
	hive_partitioning = true
)
WHERE date >= '<since_date>'
	AND cs_uri_stem LIKE '<path>%'
GROUP BY 1
ORDER BY 2 DESC, 1
LIMIT 100;
