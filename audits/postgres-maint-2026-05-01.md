# POSTGRES-MAINT-W1 Maintenance Log

**Date**: 2026-05-01
**Window**: 04:56:22 → 05:05:04 UTC (8 min 42 sec total — pause→resume; **postgres downtime: 1.7 sec**)
**Operator**: Claude Sonnet 4.5 + Mr.1
**Wave**: POSTGRES-MAINT-W1 (audit Optimizations #2 + #5 + #6)
**Verdict**: ✅ **POSTGRES_MAINT_W1_GREEN**

## Summary

| Metric | Pre-maint | Post-maint | Delta |
|---|---|---|---|
| **Postgres %CPU avg (3 × 60s pidstat)** | 13.05% (post-CRON-W1) | **6.64%** | **-49.1%** |
| **Cumulative vs audit-window peak** | 49.4% → 13.05% | 49.4% → **6.64%** | **-86.6% total** |
| `funding_history` total size | 580 MB (heap 248 + idx 331) | 495 MB (heap 248 + idx 248) | **-85 MB / -15%** |
| `funding_history` index size | 331 MB | 248 MB | **-25%** index bloat reclaimed |
| `signals` total size | 76 MB | 74 MB | -2 MB |
| `hold_counts` total size | 10 MB | 7 MB | -3 MB |
| `pg_stat_user_tables.n_live_tup` accuracy | wildly stale | matches actual COUNT | refreshed 20-73× |
| `last_analyze` on funding_history + signals | NULL (22+ days stale) | populated | ✅ |
| `shared_buffers` | 128 MB | **1 GB** (25% of 4GB RAM) | +8× |
| `pg_stat_statements` extension | not installed | **v1.10 active** | ✅ ongoing observability |
| Postgres restart downtime | n/a | **1.7s** | well under 60s spec limit |

## Phase 0 Truth Table (pre-mutation probes)

| # | Spec primitive | Reality | Resolution |
|---|---|---|---|
| 1 | Cron entries at `/etc/cron.d/algovault-*`; pause via `.disabled` rename | ❌ FICTIONAL — `/etc/cron.d/` only has e2scrub_all + .placeholder + sysstat. The 61 cron entries live in root's user crontab at `/var/spool/cron/crontabs/root` | Inline-fix: pause via `crontab -l > /tmp/crontab.bak.20260501T045622 && crontab -r`; restore via `crontab /tmp/crontab.bak.20260501T045622` |
| 2 | `last_autoanalyze` NULL on all 3 target tables | ⚠️ Partially — `funding_history` + `signals` NULL; `hold_counts` already analyzed at 04:20 UTC | Note in log; hold_counts may have less to gain |
| 3 | `shared_preload_libraries` may already be non-empty | ✅ Empty — clean append works | OK |
| 4 | container = `crypto-quant-signal-mcp-postgres-1`, Up 2 weeks | ✅ Confirmed | OK |
| 5 | postgres version | postgres:16-alpine, **PostgreSQL 16.13** | OK |
| 6 | data_directory + config_file | `/var/lib/postgresql/data/postgresql.conf` | OK |
| 7 | data-dir size on disk | **763.8 MB** | OK |
| 8 | `shared_buffers` current | 16384 × 8KB = **128 MB** | Target: 1 GB |
| 9 | docker tooling | `docker compose v5.1.1` (modern syntax) | OK |
| 10 | actual table counts vs n_live_tup | funding_history 5,466,169 vs 270,028 (20× off); signals 65,082 vs 893 (73× off); hold_counts 91,573 = matches | Confirms stale-stats audit finding |
| 11 | Pre-CRON-W1 postgres baseline (33.31%) — but CRON-W1 already shipped, so the comparison baseline is now 13.05% | Acknowledged — gain projection re-anchored | Document gain in BOTH the absolute (vs 13.05%) and the cumulative (vs 49.4%) |

**HALT decision**: 1 fictional + 1 partial = below ≥3 HALT threshold. Inline-fix proceeded.

## Step-by-Step Timing

| Step | Start (UTC) | Duration | Notes |
|---|---|---|---|
| Phase 0 probes | 04:51 | ~5 min | All read-only; no mutations |
| Pause crons (`crontab -r`) | 04:56:22 | <1s | Backup at `/tmp/crontab.bak.20260501T045622` (175 lines, 18,795 bytes) |
| In-flight drain wait | 04:56-05:02 | ~6 min (was wider than needed; pgrep gotcha caused false-positive) | Actual ps -ef confirmed zero seed/backfill processes |
| Snapshot via `pg_dump -Fc` | 05:02:21 | ~30s | `/root/algovault-postgres-pre-maint-20260501T050221.dump` (69 MB; PGDMP magic verified) |
| VACUUM (FULL, ANALYZE) funding_history | 05:02:52 | **8s** | -85 MB |
| VACUUM (FULL, ANALYZE) signals | 05:03:00 | **1s** | -2 MB |
| VACUUM (FULL, ANALYZE) hold_counts | 05:03:01 | **0s** | -3 MB |
| Backup postgresql.conf + sed edit | 05:03:01 | ~10s | `postgresql.conf.backup-2026-05-01` |
| `docker compose restart postgres` | 05:04:14.999 | **1.7s** | First successful query at 05:04:16.755 |
| `CREATE EXTENSION pg_stat_statements` | 05:04:17 | <1s | v1.10 active |
| Resume crons (`crontab /tmp/crontab.bak.*`) | 05:05:04 | <1s | 175 lines restored |
| First post-resume cron fire confirmed | 05:08:00 | n/a | Binance 30m fire: 100 seeded, 0 errors |
| **Total maintenance window** | | **8 min 42 sec** | (pause → resume) |
| **Actual postgres downtime** | | **~1.7 sec** | (restart only — VACUUM FULL didn't lock long enough to be visible) |

## Snapshot + Restore Command

**Snapshot** (taken at 05:02:21 UTC):
- File: `/root/algovault-postgres-pre-maint-20260501T050221.dump`
- Size: 69 MB
- Format: pg_dump custom format (`-Fc`)
- Verified: magic bytes `PGDMP`, exit_code=0

**Restore** (DOCS ONLY — do NOT execute unless rolling back):
```bash
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
  'cat /root/algovault-postgres-pre-maint-20260501T050221.dump | \
   docker exec -i crypto-quant-signal-mcp-postgres-1 \
     pg_restore -U algovault -d signal_performance --clean --if-exists -v'
```

## VACUUM Detail

```
[05:02:52] VACUUM (FULL, ANALYZE) funding_history;
  → 8 seconds. heap stayed at 248 MB; indexes 331 MB → 248 MB (-25%)
  → n_live_tup: 270,028 (stale) → 5,466,964 (actual)
  → last_analyze: NULL → 2026-05-01 05:03:00.27927+00

[05:03:00] VACUUM (FULL, ANALYZE) signals;
  → 1 second. heap 73 MB stable; indexes 3024 KB → 1440 KB (-52%)
  → n_live_tup: 893 → 65,087
  → last_analyze: NULL → 2026-05-01 05:03:01.135941+00

[05:03:01] VACUUM (FULL, ANALYZE) hold_counts;
  → <1 second. heap 5832 KB → 4192 KB; idx 4208 KB → 2864 KB
  → n_live_tup: 91,573 → 91,574 (already accurate)
  → last_analyze: 2026-05-01 04:20:28 (autovacuum had fired) → 2026-05-01 05:03:01.437886
```

## Config Changes Applied

```diff
--- /var/lib/postgresql/data/postgresql.conf.backup-2026-05-01
+++ /var/lib/postgresql/data/postgresql.conf
@@ Lines that changed @@
-shared_buffers = 128MB			# min 128kB
+shared_buffers = 1GB			# POSTGRES-MAINT-W1 (was 128MB)

-#shared_preload_libraries = ''	# (change requires restart)
+shared_preload_libraries = 'pg_stat_statements'	# POSTGRES-MAINT-W1
```

Verified post-restart:
```
SHOW shared_buffers;            → 1GB
SHOW shared_preload_libraries;  → pg_stat_statements
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_stat_statements';
                                → pg_stat_statements | 1.10
```

## Measurement Window: Post-Maintenance pidstat

3 × 60-sec sustained samples (`pidstat -C postgres 5 12`):

| Sample | Time (UTC) | Total postgres %CPU |
|---|---|---|
| #1 | 05:10:48 | 7.88 |
| #2 | 05:11:48 | 8.19 |
| #3 | 05:12:48 | 3.86 |
| **Average** | | **6.64%** |

### Cumulative reduction across all 4 waves (49.4% → 6.64%)

```
Audit-window peak (pre-everything):     49.4% ████████████████████████████████████████
Post-OPTIMIZE-FUNDING-CACHE-W1:         33.31% ███████████████████████████
Post-OPTIMIZE-FUNDING-CACHE-CRON-W1:    13.05% ███████████
Post-POSTGRES-MAINT-W1:                  6.64% █████
```

POSTGRES-MAINT alone (vs CRON-W1 baseline): **-49.1% additional** (massively exceeded projected -5% to -15%).

The over-projection happened because the audit's gain estimate didn't model the full benefit of fresh stats: with 20-73× stale `n_live_tup`, the planner was making cost decisions on day-zero estimates. Once stats refreshed, the planner picks meaningfully better plans. The 8× larger `shared_buffers` compounds this — hot index pages stay resident across queries instead of being repeatedly fetched.

## pg_stat_statements Top-10 by total_exec_time (post-restart, ~5-min collection)

```
calls | total_ms | mean_ms |  rows  | query
-----+----------+---------+--------+----------------------------------------------------------
   13|  20193.5 | 1553.35 | 846239 | SELECT * FROM signals ORDER BY created_at DESC
   26|  18053.6 |  694.37 |   2080 | SELECT coin, AVG(funding_rate)::float8 AS mean,
     |          |         |        |        STDDEV_SAMP(funding_rate)::float8 AS stddev,
     |          |         |        |        COUNT(*)::int AS sample_count FROM funding_history
     |          |         |        |        WHERE recorded_at >= $1 AND coin = ANY($2::text[])
     |          |         |        |        GROUP BY coin
   34|   8977.5 |  264.04 |      0 | ALTER TABLE signals ADD COLUMN IF NOT EXISTS merkle_proof JSONB
   34|   8927.4 |  262.57 |      0 | ALTER TABLE signals ADD COLUMN IF NOT EXISTS signal_hash VARCHAR(66)
   34|   8870.4 |  260.89 |      0 | ALTER TABLE signals ADD COLUMN IF NOT EXISTS merkle_batch_id INTEGER
   34|   6694.7 |  196.90 |      0 | ALTER TABLE signals ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'HL'
   34|   6690.4 |  196.78 |      0 | ALTER TABLE signals ADD COLUMN IF NOT EXISTS regime TEXT NULL
   34|   6683.8 |  196.58 |      0 | ALTER TABLE signals ADD COLUMN IF NOT EXISTS outcome_price REAL
   34|   6681.0 |  196.50 |      0 | ALTER TABLE signals ADD COLUMN IF NOT EXISTS outcome_return_pct REAL
```

### Findings

**#1 (NEW HOT QUERY identified — was invisible without pg_stat_statements)**: `SELECT * FROM signals ORDER BY created_at DESC` — 13 calls, 846,239 rows returned, 1.5s mean. This is the dashboard's signals fetch. **Returning 65K rows per call without LIMIT or pagination**. Each call processes the whole sorted table. Follow-up wave candidate: `OPTIMIZE-DASHBOARD-SIGNALS-LIMIT-W1`.

**#2 (THIS WAVE'S BENEFIT)**: The bulk-warm aggregate query from OPTIMIZE-FUNDING-CACHE-CRON-W1: 26 calls × 694ms mean = 18s total. Working as designed — running once per cron fire instead of N times.

**#3-#10**: 8 × `ALTER TABLE signals ADD COLUMN IF NOT EXISTS ...` migrations. 34 calls each (mcp-server runs migrations on every container start; 34 starts since pg_stat_statements began recording = ~one start every ~1 min during recent activity). Each takes ~200-265ms even when no-op (catalog lookup overhead). Possible follow-up: skip migrations if all columns already present (cheap pre-check).

## Acceptance Criteria Verification

- [x] Phase 0 truth-table produced + 1 fictional primitive surfaced (cron.d location); inline-fixed
- [x] Cron pause + resume verified — zero seed processes during window; normal fires resumed at 05:08:00
- [x] Backup snapshot exists at `/root/algovault-postgres-pre-maint-20260501T050221.dump` + restore command documented
- [x] All 3 tables successfully VACUUM (FULL, ANALYZE)'d; before/after sizes recorded
- [x] `SHOW shared_buffers` returns `1GB` post-restart
- [x] `pg_stat_statements` extension v1.10 active
- [x] `last_analyze` non-NULL on all 3 vacuumed tables
- [x] Service downtime: **1.7 seconds** (well under 60s limit)
- [x] `pidstat -C postgres 5 12` post-maint: **6.64% avg** (vs 30% target)
- [x] `pg_stat_statements` top-10 captured (above)
- [x] Zero data loss: COUNT(*) verified — funding_history 5,466,936 (was 5,466,169 pre-pause; +772 from in-flight cron writes that finished before drain), signals 65,087, hold_counts 91,574

## Recommended Follow-up Waves

1. **`OPTIMIZE-DASHBOARD-SIGNALS-LIMIT-W1`** (NEW from pg_stat_statements finding) — add `LIMIT 1000` (or pagination) to `SELECT * FROM signals ORDER BY created_at DESC` in the dashboard handler. This single query is now the dominant cost; ~1.5s mean × 13 calls × user traffic = potential headroom freed.
2. **`OPS-MIGRATION-IDEMPOTENCY-W1`** (lower priority) — skip ALTER TABLE migrations on container start if catalog already has all columns. Saves ~2-3s per container start.
3. **`OPS-LOG-CAP-W1`** (already specced) — Docker daemon.json log-opts + logrotate.
4. **`CRON-FREQUENCY-W1`** (already specced) — return shadow-seed 1m to `* * * * *`. With combined -86.6% reduction, this is now safely within headroom budget.
5. **Auto-trace asset universe** (Opt #7 from audit) — drop low-call coins from GRID_ASSETS.
