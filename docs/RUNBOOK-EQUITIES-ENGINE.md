# RUNBOOK — US Equities Daily-Bar Verdict Engine (EQUITIES-ENGINE-W1)

Phase-1 equities brain: Databento EQUS.MINI daily bars → composite verdicts → PFE track record.
All code is in `src/lib/equities/` + `src/scripts/{build-equity-universe,backfill-equity-bars,seed-equities,backfill-equity-outcomes}.ts` (compiled to `dist/scripts/`). Runs inside `crypto-quant-signal-mcp-mcp-server-1`.

## Architecture (one line per piece)
- **Provider** `equity-bars-provider.ts` — REST client to `hist.databento.com/v0` (HTTP Basic, key=username). `getDailyBars` (specific syms, map_symbols), `getDailyBarsRaw` (ALL_SYMBOLS, instrument_id), `resolveSymbology`, `getCostUsd`, `getLatestAvailableSession`.
- **Universe** `build-equity-universe.ts` → `equity_universe` (top-500 by median $-vol + 8 ETFs). Re-runnable (idempotent re-freeze).
- **Bars** `backfill-equity-bars.ts` → `equity_bars_daily` (2y, universe-only, `ON CONFLICT DO NOTHING`, resumable).
- **Verdict** `equity-verdict.ts` (pure) → BUY/SELL/HOLD + confidence + regime + `factors[]` (technical:* / regime:* only).
- **Nightly** `seed-equities.ts` (cron `17 9 * * 2-6`) — pull latest session bars → upsert → compute → `equity_verdicts`. Holiday/no-advance no-op.
- **Outcomes** `backfill-equity-outcomes.ts` (cron `41 9 * * 2-6`) — fill `pfe_pct` from stored bars at the PFE horizon (5 sessions). No Databento call.
- **MCP** `get_equity_call` + `get_equity_regime`; additive `equities` key on `performance://signal-performance` (PFE-only).

## Cron (host root crontab, UTC, off-:00 — T+1 per C1 freshness probe)
```
17 9 * * 2-6 docker exec crypto-quant-signal-mcp-mcp-server-1 node dist/scripts/seed-equities.js >> /var/log/seed-equities.log 2>&1; /opt/algovault-monitoring/equity-verdict-watch.sh >> /var/log/equity-verdict-watch.log 2>&1
41 9 * * 2-6 docker exec crypto-quant-signal-mcp-mcp-server-1 node dist/scripts/backfill-equity-outcomes.js >> /var/log/backfill-equity-outcomes.log 2>&1
```
EQUS.MINI historical is **T+1**: at the 09:17 UTC fire (Tue–Sat covers Mon–Fri sessions) the prior session's bar is available; verdicts label `as_of_session = previous`. The seed processes `max(available session)` so timing only affects freshness, not correctness.

## Operations

### Re-run a nightly seed (idempotent)
```
docker exec crypto-quant-signal-mcp-mcp-server-1 node dist/scripts/seed-equities.js
```
No-ops if the latest session already has verdicts. To force a recompute of a session, delete its verdict rows first: `DELETE FROM equity_verdicts WHERE session_date='YYYY-MM-DD' AND engine_version='equities-v1';` then re-run.

### Resume an interrupted backfill
Just re-run `backfill-equity-bars.js` — `ON CONFLICT (symbol, session_date) DO NOTHING` makes it resumable; already-stored bars are skipped.

### Re-freeze the universe (e.g., quarterly)
```
docker exec crypto-quant-signal-mcp-mcp-server-1 node dist/scripts/build-equity-universe.js
```
Re-ranks top-500 by median $-vol; symbols dropping out are set `active=false` (history retained — Data Integrity).

### Inspect the quarantine list (symbols suppressed by an unexplained >18% overnight gap)
A symbol is quarantined when an unexplained overnight gap >18% occurred in its last 20 sessions (likely an unadjusted split — adjustment factors are NOT entitled on the usage-based plan, C1 NO-GO). It surfaces as `regime='quarantined'` in its latest verdict:
```
SELECT symbol, session_date, call, regime FROM equity_verdicts
WHERE regime='quarantined' AND session_date=(SELECT max(session_date) FROM equity_verdicts) ORDER BY symbol;
```
It auto-releases after 20 fresh sessions with no >18% gap (no manual action).

### Key rotation (DATABENTO_API_KEY)
1. Mint a new key in the Databento portal.
2. Update the compose `.env` (idempotent): `sed -i '/^DATABENTO_API_KEY=/d' /opt/crypto-quant-signal-mcp/.env && printf 'DATABENTO_API_KEY=%s\n' "$NEW" >> /opt/crypto-quant-signal-mcp/.env && chmod 600 /opt/crypto-quant-signal-mcp/.env`
3. Reload (env_file is only re-read by `up -d`, NOT `restart`): `cd /opt/crypto-quant-signal-mcp && docker compose up -d mcp-server`
4. Verify: `docker exec crypto-quant-signal-mcp-mcp-server-1 env | grep -c '^DATABENTO_API_KEY=db-'` → 1.

### Cost monitor (usage-based billing; $125 signup credits)
Every producer logs its `metadata.get_cost` estimate before pulling. Phase-1 daily-bar costs are tiny (~$1.3 universe build, ~$0.4 backfill, ~$0.01/night seed). Check the portal Billing page for the live credit balance. A `$0` probe never spends; only `timeseries.get_range` does.

### Zero-verdict watchdog
`equity-verdict-watch.sh` (chained in the seed cron) fires ONE `OPS_EQUITY_ZERO_VERDICT` Telegram alert (via `send_telegram.sh`, CRITICAL_PERSISTENT, 24h cooldown) only when the producer has been silent for 3+ sessions (0 verdict-sessions in the last 7 days) while bars exist. Everything else is silent + forensic (logs only).

## Phase 2 (not this wave)
EQUS.MINI **live** subscription (intraday). Trigger: equity-tool call share ≥ stated % of total OR a paying-customer ask. Same provider, new schema param.
