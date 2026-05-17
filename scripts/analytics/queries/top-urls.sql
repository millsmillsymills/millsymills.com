-- top-urls: which URLs got the most requests in the lookback window.
--
-- Substituted by scripts/analytics/run.sh:
--   <bucket>                          → <stack>.com-logs
--   <since_year> <since_month> <since_day> → today - <days>
--
-- Partition pruning: the make_date(year, month, day) >= make_date(...)
-- predicate is folded against the Hive partition columns so DuckDB skips
-- partitions outside the window. Verify with `EXPLAIN` if a query gets slow.

SELECT
	cs_uri_stem AS path,
	COUNT(*)    AS hits
FROM read_parquet(
	's3://<bucket>/cloudfront-access/**/*.parquet',
	hive_partitioning = true
)
WHERE make_date(
	CAST(year  AS INTEGER),
	CAST(month AS INTEGER),
	CAST(day   AS INTEGER)
) >= make_date(<since_year>, <since_month>, <since_day>)
GROUP BY 1
ORDER BY 2 DESC
LIMIT 50;
