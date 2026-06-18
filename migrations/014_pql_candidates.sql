-- 014_pql_candidates.sql — CONVERSION-MEASUREMENT-W1 / C3
-- Product-Qualified-Lead (PQL) substrate: one row per FREE ip_hash with its raw
-- intent signals + a simple env-independent score. The env THRESHOLDS + the
-- is-PQL decision live in JS (src/lib/pql.ts getPqlCandidates), so a misconfigured
-- env can never silently admit everyone (default-deny on NaN). Read-only; the
-- view touches nothing — pure SELECT over request_log + quota_usage + funnel_events.
--
-- This is the PG (windowDays=7) form. The runtime ensurePqlView() recreates it
-- idempotently (PG CREATE OR REPLACE; SQLite DROP+CREATE) with the live
-- PQL_WINDOW_DAYS, so this file is the canonical pre-apply + repo record. The
-- rolling-window boundary is rendered as an ISO-millis string comparable to the
-- TEXT request_log.timestamp column lexicographically.
--
-- PII: the view exposes ip_hash for internal joins ONLY; getPqlCandidates
-- projects an 8-char candidate_ref (never the raw ip_hash, a forbidden key on
-- the funnel-snapshot public shape).
--
-- Pre-applied to prod signal_performance via SSH BEFORE the code commit; CREATE
-- OR REPLACE makes the deployed ensurePqlView() a no-op against the prepared DB.

CREATE OR REPLACE VIEW pql_candidates AS
WITH free_calls AS (
  SELECT ip_hash, session_id, timestamp
  FROM request_log
  WHERE license_tier = 'free' AND is_bot_internal = false AND ip_hash IS NOT NULL
),
call_stats AS (
  SELECT ip_hash,
         COUNT(*) AS total_calls,
         COUNT(*) FILTER (WHERE timestamp >= to_char(now() - interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS recent_calls,
         MAX(timestamp) AS last_call
  FROM free_calls
  GROUP BY ip_hash
),
quota AS (
  SELECT SUBSTR(tracker_key, 6) AS ip_hash, call_count
  FROM quota_usage WHERE tracker_key LIKE 'free:%'
),
aha AS (
  SELECT DISTINCT fc.ip_hash
  FROM funnel_events fe
  JOIN free_calls fc ON fc.session_id = fe.session_id
  WHERE fe.event_type = 'first_non_hold_verdict'
)
SELECT
  cs.ip_hash,
  cs.total_calls,
  cs.recent_calls,
  cs.last_call,
  COALESCE(q.call_count, 0) AS quota_call_count,
  CASE WHEN a.ip_hash IS NOT NULL THEN 1 ELSE 0 END AS reached_aha,
  (COALESCE(q.call_count, 0) + cs.recent_calls + CASE WHEN a.ip_hash IS NOT NULL THEN 30 ELSE 0 END) AS score
FROM call_stats cs
LEFT JOIN quota q ON q.ip_hash = cs.ip_hash
LEFT JOIN aha a ON a.ip_hash = cs.ip_hash;
