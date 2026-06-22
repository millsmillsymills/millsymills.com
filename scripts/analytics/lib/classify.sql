-- Shared request classifier for the analytics queries. Single source of
-- truth for "is this request automated" — substring heuristics over the
-- User-Agent plus an explicit named-scanner list and the empty-UA case.
--
-- Prepended verbatim by scripts/analytics/run.sh (live preamble) and
-- scripts/analytics/lint-queries.sh (fake-schema preamble), so every query
-- can call is_automated(...) under both runtime and lint. UA-based and
-- deliberately deterministic: it will under-count scanners that spoof a
-- browser UA — that's an accepted limitation, documented in the README.
--
-- To add a scanner: extend the alternation below. One edit, both runners.

CREATE OR REPLACE MACRO is_automated(ua) AS (
	ua IS NULL
	OR ua = '-'
	OR regexp_matches(
		lower(ua),
		'bot|crawler|spider|slurp|wget|curl|httpclient|httpx|python-requests'
		|| '|libwww|scrapy|headless|scanner|interceptor-dashboard|palo alto'
		|| '|censys|zgrab|masscan|ahrefs|semrush'
	)
);
