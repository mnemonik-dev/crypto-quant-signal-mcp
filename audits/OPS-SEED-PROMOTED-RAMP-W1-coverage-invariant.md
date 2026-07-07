# OPS-SEED-PROMOTED-RAMP-W1 — seed-coverage invariant (audit shape)

Referenced by the `SEED_COVERAGE_GAP` operator-action Telegram alert
(`ops/cron/seed-coverage-canary.sh`, 11th `send_telegram.sh` consumer).

## Invariant

Every `venues.status = 'promoted'` venue MUST be covered by ≥1 crontab seed line whose
`--timeframe` is **fast** (∈ `{3m, 5m, 15m, 30m}` — all strictly under the monitor's 45-min
freshness SLA). The monitor (`dist/scripts/monitor.js::checkSeedAttemptFreshness`) derives
its expected set from `listVenues('promoted')`; the producer MUST derive the SAME set.

**Durable wiring (OPS-SEED-PROMOTED-RAMP-W1, 2026-07-07):** the fast seed lines use
`--status promoted --exclude HL` (HL rides its own by-design-slow legacy lines). So a
promotion is a single `venues.status` flip with **no crontab edit** — the producer and
monitor can never disagree about which venues are seeded.

## Failure mode this alert catches

A seed line reverts to a hardcoded `--exchange-list BINANCE,BYBIT,OKX,BITGET` — e.g. the
**superseded** host-only `/opt/algovault-monitoring/seed-orchestrator-crontab.sh --apply`
rebuilds the orchestrator block that way — silently dropping the 7 non-fast promoted venues
(ASTER, BINGX, GATE, HTX, KUCOIN, MEXC, PHEMEX). They then lapse past 45m → the daily
"Seed OUTAGE: no seed fire reached … in ≥45m" symptom alert. This canary fires FIRST, at
the config level, with the specific cause + fix.

## Restore recipe (OPS-SEED-COVERAGE-RESTORE-W{NEXT})

1. `bash /opt/crypto-quant-signal-mcp/ops/cron/seed-promoted-ramp.sh --check` — review the diff.
2. `… --apply` — backs up the crontab + re-points 3m/5m/15m/30m/1h/2h/4h/8h/12h to
   `--status promoted --exclude HL` (idempotent; 1d + shadow + HL lines untouched).
3. Verify: `node /opt/crypto-quant-signal-mcp/scripts/check-seed-coverage.mjs --promoted "<promoted CSV>"` exits 0.
4. If the reverting generator keeps re-firing, neutralize it (rename/guard the superseded
   `seed-orchestrator-crontab.sh`).

## Detection

- Pure core `scripts/check-seed-coverage.mjs` (unit-tested in `tests/unit/seed-coverage-canary.test.ts`
  — ramp-proof auto-enroll AND hardcoded-revert-flags-new-venue both pinned).
- Runs hourly (off-`:00`) via `ops/cron/seed-coverage-canary.sh` → `send_telegram.sh`
  (`SEED_COVERAGE_GAP`, CRITICAL_PERSISTENT, 24h cooldown, fail-open).
