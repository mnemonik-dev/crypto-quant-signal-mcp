# EXCHANGE-SHADOW-PROMOTE-W1 — endpoint-truth.md (Plan Mode Step 0)

**Wave:** venue-status state machine for safe exchange expansion (5-chapter Tier-2 Bulk-Spec).
**Date:** 2026-05-16
**Code:** Claude Opus 4.7 (1M)
**Mode:** Plan Mode Step 0 (self-init per 5 risk markers: destructive ops, cross-host orchestration, external API first-use, identifier in >1 place, ≥4 chapters).
**Outcome:** ⚠ **Approval required** — no HALT-class findings (≤2 fictional primitives + all fixable inline), but multiple spec primitives need inline correction before C1 begins. Plan-Mode artifact lists all fixes for architect ratification.

---

## 1. Wave Objective (verbatim restatement)

Promote any new exchange integration ONLY when its post-integration PFE WR ≥80% over a sample of `asset_count × 10` BUY/SELL calls (HOLDs excluded). Default new venues to `shadow` status; gate dashboard inclusion + public aggregates on `promoted`. Auto-promote via daily cron when criteria met. Auto-extend once at day-15 if criteria miss; Mr.1-manual at day-30. Shadow venues remain callable via explicit MCP `exchange:` param with `(experimental)` describe-text flag. HOLDs always excluded from WR math (matches existing dashboard math per CHANGE-DEFAULT-EXCHANGE-W1).

**Ratified design** (Mr.1 2026-05-15):
- PFE WR threshold: 0.80
- Sample size: `min_buy_sell_sample = asset_count × 10`
- Window: `max(15 days, sample-met)`
- Failure path: day-15 miss → auto-extend 15d; day-30 second miss → Telegram alert "manual decision required: PROMOTE / RETIRE / EXTEND_AGAIN"
- Public exposure during shadow: opt-in via explicit MCP `exchange:` param; describe-text tag `(experimental)`; NOT in dashboard
- HOLDs in WR: EXCLUDED

---

## 2. Identifier-diff table (every identifier × every cited site)

| Identifier | Site | Spec literal | Verified? |
|---|---|---|---|
| `'shadow'` | C1 migration CHECK | `status IN ('shadow', 'promoted', 'retired')` | ✓ matches AC |
| `'shadow'` | C1 backfill | 5 existing venues NOT in shadow | ✓ all backfill to 'promoted' |
| `'shadow'` | C2 default | `getVenueStatus(unknown) → 'promoted'` | ✓ backward-compat default |
| `'shadow'` | C3 cron filter | `WHERE venues.status = 'shadow'` | ✓ |
| `'shadow'` | C4 public filter | `WHERE venues.status = 'promoted'` (inverse) | ✓ |
| `'shadow'` | C4 shadow endpoint | `WHERE venues.status = 'shadow'` | ✓ |
| `'shadow'` | C5 pilot seed | `(<PILOT>, 'shadow', ...)` | ✓ |
| `'shadow'` | C5 AC envelope | `_algovault.venue_status: "shadow"` | ✓ matches C2 |
| `'shadow'` | tools/list describe | `"shadow mode, promotes to dashboard at ≥80% PFE WR"` | ✓ |
| `'promoted'` | C1 migration | initial backfill state for 5 existing | ✓ |
| `'promoted'` | C2 default | unknown venue defaults `'promoted'` | ✓ |
| `'promoted'` | C3 cron action | `setStatus(id, 'promoted', { promoted_at: now })` | ✓ |
| `'promoted'` | C4 public API filter | `WHERE venues.status = 'promoted'` | ✓ |
| `'promoted'` | C5 AC pilot | post-promotion behavior — out of scope (pilots start shadow) | ✓ |
| `'retired'` | C1 migration CHECK | enum member only | ✓ no AC writes this in W1 |
| `'retired'` | C3 manual_required Telegram | one of 3 action buttons (PROMOTE / RETIRE / EXTEND_AGAIN) | ✓ no auto-retire path in W1 |
| `'retired'` | C5 runbook | failure-mode entry | ✓ |
| `min_buy_sell_sample` | C1 schema | `INTEGER NOT NULL CHECK (> 0)` | ✓ |
| `min_buy_sell_sample` | C1 backfill formula | `asset_count × 10` | ✓ |
| `min_buy_sell_sample` | C3 decision tree | `buy_sell_count >= min_buy_sell_sample` | ✓ |
| `asset_count` | C1 schema | `INTEGER NOT NULL CHECK (> 0)` | ✓ |
| `asset_count` | C1 backfill | `SELECT COUNT(DISTINCT coin) FROM signals WHERE exchange = X` | ✓ |
| `asset_count` | C5 pilot seed | probed via venue exchangeInfo at integration | ✓ |
| `extension_count` | C1 schema | `INTEGER DEFAULT 0 CHECK (>= 0 AND <= 2)` | ✓ |
| `extension_count` | C3 decision tree | branches on `extension_count == 0` / `== 1` | ✓ |
| `days_since` | C3 decision tree | `floor((now - integrated_at) / 86400)` | ✓ |
| `PFE WR threshold` | Wave Objective | `0.80` | ✓ |
| `PFE WR threshold` | C3 decision tree | `pfe_wr >= 0.80` | ✓ |
| `Window day-15 floor` | Wave Objective | `max(15 days, sample-met)` | ✓ |
| `Window day-15 floor` | C3 decision tree | `days_since >= 15` | ✓ |
| `Window day-30 manual` | Wave Objective | `extension_count == 1 AND days_since >= 30` → manual | ✓ |
| `Window day-30 manual` | C3 decision tree | `days_since >= 30 AND extension_count == 1` | ✓ |

**Identifier-diff verdict:** ✅ Clean. All three enum members + lifecycle thresholds match exactly across Wave Objective + 5 chapter scopes + Acceptance Criteria.

---

## 3. Spec-cited primitives — probe results

| # | Primitive | Cited shape (spec) | Reality (verified 2026-05-16) | Action |
|---|---|---|---|---|
| 1 | `signals.outcome_pfe_wr` column | C3 decision tree: `SELECT AVG(CASE WHEN outcome_pfe_wr THEN 1.0 ELSE 0.0 END)` | ❌ **does NOT exist.** Production `\d signals` shows: `pfe_return_pct REAL`, `mae_return_pct REAL` (no `outcome_pfe_wr` boolean). | **Fixable inline** — derive WR from `pfe_return_pct`: `AVG(CASE WHEN (signal='BUY' AND pfe_return_pct > 0) OR (signal='SELL' AND pfe_return_pct < 0) THEN 1.0 ELSE 0.0 END) WHERE pfe_return_pct IS NOT NULL`. Matches existing math in `src/lib/performance-db.ts:570` + `:580`. |
| 2 | `signals.outcome_evaluated` column | C3 decision tree: `WHERE … AND outcome_evaluated = TRUE` | ❌ **does NOT exist.** Implicit via `pfe_return_pct IS NOT NULL`. | **Fixable inline** — replace with `pfe_return_pct IS NOT NULL`. |
| 3 | `signals.signal` column (not `signals.call`) | Spec uses `signal IN ('BUY','SELL')` in decision tree | ✅ exists — column is `signal TEXT NOT NULL`. | none |
| 4 | `signals.exchange` column | C3 decision tree: `WHERE exchange = $1` | ✅ exists — `exchange TEXT NOT NULL DEFAULT 'HL'`. | none |
| 5 | `signals.created_at` column | C3 decision tree: `WHERE created_at > venues.integrated_at` | ✅ exists — `created_at INTEGER NOT NULL` (unix-seconds-int, NOT `TIMESTAMPTZ`). | **Inline note:** comparison must be `created_at > EXTRACT(EPOCH FROM venues.integrated_at)::INTEGER`. |
| 6 | `TELEGRAM_OPS_CHAT_ID` env var | C3 `telegram-alerts.ts → posts to $TELEGRAM_OPS_CHAT_ID` | ❌ **does NOT exist.** Hetzner `/opt/crypto-quant-signal-mcp/.env` has `TELEGRAM_CHAT_ID` only. | **Fixable inline** — reuse `TELEGRAM_CHAT_ID` via existing `sendAlert(msg, 'warning'\|'info')` in `src/lib/telegram.ts`. No new env var. |
| 7 | `src/lib/telegram-alerts.ts` (new file if absent) | C3 — new payload type lives here | ⚠ **partial reality** — `src/lib/telegram.ts` ALREADY exists with `sendAlert` + `sendDigest`. Creating a parallel `telegram-alerts.ts` would fork the surface. | **Fixable inline** — extend existing `src/lib/telegram.ts` with new `sendVenueStatusChange()` export. Do NOT create a new file. |
| 8 | `migrations/<YYYYMMDDHHMMSS>_venues_table.sql` filename convention | C1 — timestamp-prefix | ❌ **convention mismatch.** Existing `migrations/` has 1 file: `001_add_regime_column.sql` (numeric `NNN_` prefix). | **Fixable inline** — use `migrations/002_venues_table.sql` + `migrations/003_seed_venues_promoted.sql`. |
| 9 | Migration runner | C1 implies `.sql` files run automatically | ⚠ **partial reality** — `migrations/` is historical/audit-only. Actual runtime migrations run via `runMigrations()` in `src/lib/performance-db.ts:194` using a `SIGNAL_MIGRATIONS[]` descriptor array (ALTER TABLE per descriptor + `information_schema.columns` pre-check). | **Fixable inline** — add `CREATE_VENUES_TABLE_SQL` + `INIT_VENUES_BACKFILL_SQL` constants in new `src/lib/venue-store.ts`; export `initVenuesTable()` that runs both idempotently on first call. Also ship the audit `.sql` files. |
| 10 | `systemctl --user list-timers` | C3 verification gate | ❌ **wrong scope.** All algovault timers on Hetzner are system-level at `/etc/systemd/system/` (per `systemctl list-timers --all`: `algovault-bot-cron.timer`, `algovault-bot-digest.timer`, `algovault-funnel-snapshot.timer`). The `--user` scope is empty. | **Fixable inline** — `systemctl list-timers --all \| grep evaluate-venues` (no `--user`). Install to `/etc/systemd/system/evaluate-venues.{service,timer}`. |
| 11 | `/var/log/algovault/evaluate-venues.log` log path | C3 AC log location | ⚠ **partial reality** — Hetzner has logs directly under `/var/log/` (`/var/log/seed-*.log`, `/var/log/backfill.log`); no `/var/log/algovault/` directory. | **Fixable inline** — `/var/log/algovault-evaluate-venues.log` (flat, matches existing naming). Or create `/var/log/algovault/` mkdir-on-first-write. Recommend the flat naming for consistency. |
| 12 | `/api/performance-public.byCallType` | Sample math in Wave Objective | ✅ exists — live curl confirmed: keys are `["BUY","SELL","HOLD"]` per top-level + each `byExchange.<EX>.byCallType`. | none |
| 13 | `/api/performance-public.byExchange.<EX>.byCallType` | Sample math | ✅ exists — nested per-venue breakdown confirmed live. | none |
| 14 | `_algovault.venue_status` envelope field | C2 — `tools/list`-emitted | ❌ **does NOT yet exist.** Current `_algovault` envelope (built in `src/tools/get-trade-call.ts:376`): `{version, tool, compatible_with, session_id, upgrade_hint?}`. | **C2 work:** widen `TradeCallResult['_algovault']` interface in `src/types.ts` + add `venue_status` + `exchange` fields in 3 envelope sites. |
| 15 | `_algovault.exchange` envelope field | C2 — fixes spec drift from CHANGE-DEFAULT-EXCHANGE-W1 AC3 | ❌ **does NOT yet exist.** Field was missing in W1; spec for this wave owns the fix. | **C2 work:** add to `get-trade-call.ts` + `get-market-regime.ts` envelopes. |
| 16 | `mcp://algovault/venues` resource | C2 + C4 | ❌ **does NOT yet exist.** Existing resources: `analytics://usage-stats`, `performance://signal-performance`, `verify://signal/{id}`. | **C2 work:** register via `server.resource('venues', 'mcp://algovault/venues', ...)`. |
| 17 | `/api/performance-shadow` endpoint | C4 | ❌ **does NOT yet exist.** | **C4 work:** new Express handler. |
| 18 | `landing/track-record.html` (separate file) | C4 — snapshot copy lives here | ❌ **does NOT exist as a static file.** `/track-record` is FUNCTION-RENDERED by `getPerformanceDashboardHtml` in `src/index.ts:1288`+. There is NO `landing/track-record.html` file. | **Fixable inline** — patch the function-rendered HTML in `src/index.ts` instead. The `data-tr-field="shadow_venue_count"` span belongs in the existing `getPerformanceDashboardHtml` output. |
| 19 | `track-record-proxy.js` live-bind | C4 | ✅ exists at `landing/js/track-record-proxy.js`. | C4 needs to confirm it auto-hydrates `data-tr-field="shadow_venue_count"` from a new `/api/performance-public` field (`shadow_venue_count`) or fetches `/api/performance-shadow.venues.length`. |
| 20 | `signals.outcome_pfe_wr` mentioned in C3 only | (see #1) | — | — |
| 21 | `AOE per-venue weight registry` consumer | Map Anchor edge | ⚠ documented-only — spec calls it "NEW edge" but doesn't describe what AOE does. | **Fixable inline** — annotate as documented-only edge in system-map.md; no code-side action this wave. |
| 22 | `signals.outcome_evaluated` in `tests/unit/evaluate-venues.test.ts` Edge: `pfe_wr = NULL` | C3 test scope | — | The "NULL" branch is real (signals with no Phase E backfill yet) — implement via `pfe_return_pct IS NOT NULL` filter. |

**Spec-cited-primitives verdict:** ⚠ 9 of 22 need inline correction; 0 of 22 HALT-class (the 1–2 fictional threshold for HALT is not breached because all 9 have well-known inline equivalents in the production codebase).

---

## 4. Proposed exact bash — destructive ops + cross-host orchestration

### 4.a Postgres migration (C1) — idempotent CREATE + ON CONFLICT backfill

Run from Hetzner (NOT via SSH heredoc — write a script first to avoid `python3 -` / `bash -s` stdin-vs-script collisions; see `ssh-python-stdin-script-vs-heredoc-mutex` skill):

```bash
# 1. scp the migration SQL to Hetzner
cd /Users/tank/crypto-quant-signal-mcp
scp -i ~/.ssh/algovault_deploy migrations/002_venues_table.sql \
    migrations/003_seed_venues_promoted.sql \
    root@204.168.185.24:/tmp/

# 2. Run from Hetzner inside the postgres container (transactional)
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
  'docker cp /tmp/002_venues_table.sql crypto-quant-signal-mcp-postgres-1:/tmp/ && \
   docker cp /tmp/003_seed_venues_promoted.sql crypto-quant-signal-mcp-postgres-1:/tmp/ && \
   docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -v ON_ERROR_STOP=1 -1 -f /tmp/002_venues_table.sql && \
   docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -v ON_ERROR_STOP=1 -1 -f /tmp/003_seed_venues_promoted.sql'
```

`003_seed_venues_promoted.sql` derives `asset_count` from `signals` at runtime to avoid hardcoding numbers that drift:

```sql
-- 003_seed_venues_promoted.sql
INSERT INTO venues (exchange_id, status, asset_count, min_buy_sell_sample, integrated_at, promoted_at, extension_count)
SELECT
  exchange_id,
  'promoted'::TEXT AS status,
  asset_count,
  asset_count * 10 AS min_buy_sell_sample,
  to_timestamp(integrated_at) AS integrated_at,
  NOW() AS promoted_at,
  0 AS extension_count
FROM (
  SELECT exchange AS exchange_id,
         COUNT(DISTINCT coin) AS asset_count,
         MIN(created_at) AS integrated_at
  FROM signals
  WHERE exchange IN ('HL','BINANCE','BYBIT','OKX','BITGET')
  GROUP BY exchange
) t
ON CONFLICT (exchange_id) DO NOTHING;
```

**Idempotency:** `CREATE TABLE IF NOT EXISTS` + `ON CONFLICT DO NOTHING` make the whole migration safe to re-run. The same SQL gets exposed via `initVenuesTable()` in `venue-store.ts` so container-restart-on-fresh-DB also bootstraps the table.

**Safety:** transactional via `-1 -v ON_ERROR_STOP=1`. Backup taken via `pg_dump -Fc` BEFORE running per `docs/RUNBOOK-POSTGRES-MAINT.md` if architect insists; given the wave is ADD-ONLY (no DROP / ALTER on existing data), backup is recommended but not blocking.

### 4.b systemd timer install (C3)

Two-file pattern matching `algovault-bot-cron.timer` already on Hetzner:

```bash
# 1. Author files locally + commit to repo (deploy/systemd/)
mkdir -p deploy/systemd
cat > deploy/systemd/evaluate-venues.service <<'EOF'
[Unit]
Description=AlgoVault — evaluate-venues daily promotion-decision cron
After=network.target docker.service

[Service]
Type=oneshot
User=root
WorkingDirectory=/opt/crypto-quant-signal-mcp
EnvironmentFile=/opt/crypto-quant-signal-mcp/.env
ExecStart=/usr/bin/docker exec -e EVAL_PROBED_AT=$(date -u +%%FT%%TZ) crypto-quant-signal-mcp-mcp-server-1 node dist/scripts/evaluate-venues.js
StandardOutput=append:/var/log/algovault-evaluate-venues.log
StandardError=append:/var/log/algovault-evaluate-venues.log
EOF

cat > deploy/systemd/evaluate-venues.timer <<'EOF'
[Unit]
Description=Run evaluate-venues daily at 06:00 UTC

[Timer]
OnCalendar=*-*-* 06:00:00 UTC
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
EOF

# 2. Install on Hetzner (system-level — matches existing algovault-bot-cron.timer pattern)
scp -i ~/.ssh/algovault_deploy \
  deploy/systemd/evaluate-venues.service \
  deploy/systemd/evaluate-venues.timer \
  root@204.168.185.24:/etc/systemd/system/

ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 'systemctl daemon-reload && \
  systemctl enable --now evaluate-venues.timer && \
  systemctl list-timers --all | grep evaluate-venues'

# 3. Smoke-fire (one-off, manually) to capture first-run log
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 'systemctl start evaluate-venues.service && \
  sleep 5 && tail -20 /var/log/algovault-evaluate-venues.log'
```

**Idempotency:** `enable --now` is safe to re-run. The service is `Type=oneshot` so each invocation is independent.

### 4.c Telegram alert wiring (C3)

Extend EXISTING `src/lib/telegram.ts` (do NOT create `src/lib/telegram-alerts.ts`):

```ts
// In src/lib/telegram.ts — append after sendDigest:

export interface VenueStatusChangeAlert {
  venue: string;
  action: 'promoted' | 'extended' | 'manual_required';
  pfe_wr: number | null;
  buy_sell_count: number;
  min_buy_sell_sample: number;
  days_since: number;
  extension_count: number;
}

export async function sendVenueStatusChange(payload: VenueStatusChangeAlert): Promise<boolean> {
  if (!isConfigured()) return false;
  const emoji = payload.action === 'promoted' ? '🟢' : payload.action === 'extended' ? '🟡' : '🔴';
  const wr = payload.pfe_wr === null ? 'n/a' : `${(payload.pfe_wr * 100).toFixed(1)}%`;
  const msg = `${emoji} *Venue ${payload.action}: ${payload.venue}*
PFE WR: ${wr}
Sample: ${payload.buy_sell_count} / ${payload.min_buy_sell_sample}
Days since integration: ${payload.days_since}
Extensions used: ${payload.extension_count} / 2`;
  return post(msg);  // existing helper
}
```

Re-uses the existing `TELEGRAM_CHAT_ID` env var. Telegram smoke-test from the wave's verification gate:

```bash
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
  'docker exec crypto-quant-signal-mcp-mcp-server-1 node -e \
  "import(\"./dist/lib/telegram.js\").then(t => t.sendVenueStatusChange({venue:\"TEST\",action:\"extended\",pfe_wr:0.65,buy_sell_count:600,min_buy_sell_sample:1000,days_since:15,extension_count:1}).then(r=>console.log(\"sent=\",r)))"'
```

---

## 5. Ambiguous deps + recommended resolutions

| # | Ambiguity | Recommendation |
|---|---|---|
| A | `migrations/<YYYYMMDDHHMMSS>_…` filename convention | Use `002_venues_table.sql` + `003_seed_venues_promoted.sql` (matches existing `001_add_regime_column.sql`). |
| B | Migration runner mechanism (file-based vs runtime descriptor) | Ship BOTH: the `.sql` files for audit/manual ops + a `venue-store.ts` `initVenuesTable()` helper that runs the same SQL idempotently on first call (so container-restart-on-fresh-DB also bootstraps). |
| C | `outcome_pfe_wr` / `outcome_evaluated` fictional columns | Derive WR from `pfe_return_pct` per existing math in `src/lib/performance-db.ts:570`/`:580`: `AVG(CASE WHEN (signal='BUY' AND pfe_return_pct > 0) OR (signal='SELL' AND pfe_return_pct < 0) THEN 1.0 ELSE 0.0 END) FILTER (WHERE pfe_return_pct IS NOT NULL)`. |
| D | `created_at INTEGER` (unix seconds) vs `integrated_at TIMESTAMPTZ` | Cast in the WHERE clause: `created_at > EXTRACT(EPOCH FROM v.integrated_at)::INTEGER`. |
| E | `TELEGRAM_OPS_CHAT_ID` fictional env var | Reuse existing `TELEGRAM_CHAT_ID`. Alert routing distinguished by emoji + alert-level in the message body, not by separate chat. |
| F | `src/lib/telegram-alerts.ts` new file | Extend existing `src/lib/telegram.ts`. |
| G | systemd `--user` scope | Install system-level at `/etc/systemd/system/` (matches existing algovault-bot-cron.timer convention). `systemctl list-timers --all` (no `--user`). |
| H | `/var/log/algovault/evaluate-venues.log` directory missing | Use `/var/log/algovault-evaluate-venues.log` (flat, matches `/var/log/backfill.log` convention). |
| I | `landing/track-record.html` (static file) vs function-rendered | Patch the function-rendered HTML in `src/index.ts:getPerformanceDashboardHtml`. No `landing/track-record.html` file exists; spec language was shorthand. |
| J | `_algovault.venue_status` + `_algovault.exchange` envelope additions | Widen `TradeCallResult['_algovault']` TS interface in `src/types.ts` + add fields in 3 envelope sites (`src/tools/get-trade-call.ts:376`, `src/tools/get-market-regime.ts:203`, and `src/tools/scan-funding-arb.ts:161` for completeness — though scan-funding-arb has no single venue, set `venue_status: null`). |
| K | `mcp://algovault/venues` MCP resource | Register via `server.resource('venues', 'mcp://algovault/venues', {...}, async () => {...})` per existing pattern at `src/index.ts:258` / `:274` / `:299`. |
| L | `byCallType` + `byExchange` shapes | ✅ Verified live — keys are `BUY`/`SELL`/`HOLD` per nesting level. No change needed. |
| M | AOE `venues.promoted_at` consumer | No code-side AOE update this wave. Annotate as `documented-only` edge in system-map.md; AOE's actual consumption is Phase 3 work. |
| N | Forbidden-phrase canary impact on existing tests | The new `describeVenueForToolList` adds `"experimental"` to tools/list describe-text. Verify the existing `tests/unit/default-exchange-binance.test.ts` "describe-text contains 'Binance USDT-M Futures (default)'" still passes (it should — substring containment). |
| O | Snapshot pipeline `shadow_venue_count` | Update `scripts/snapshot_capabilities.mjs` to read `/api/performance-public.shadow_venue_count` (NEW field — add to public API response in C4). Snapshot fallback: 0. |
| P | C5 pilot picks gated on Plan-Mode CSV ratification | Defer Plan-Mode CSV generation to C5 START (not Step 0) — C1-C4 don't need pilots. CSV gets architect ratification before C5 code lands. |

---

## 6. system-map.md edge-touch enumeration

Every Map Anchor row + status per `system-map.md` Last-touched line:

| Map Anchor row | Status |
|---|---|
| NEW component: `venues` postgres table | ✓ tracked — will add new row to `Producer → Consumer edge table` |
| NEW cron: `evaluate-venues` (daily 06:00 UTC) | ✓ tracked — will add new row |
| MUTATED edge: `signal-MCP → /api/performance-public` (venues.status filter) | ✓ tracked — will annotate existing row |
| NEW edge: `signal-MCP → /api/performance-shadow` | ✓ tracked — new row |
| MUTATED edge: `signal-MCP → MCP clients (tools/list)` describe-text | ✓ tracked — will annotate existing row |
| MUTATED edge: `signal-MCP → Telegram bot alert channel` new payload `venue_status_change` | ✓ tracked — will annotate existing monitor.js row |
| NEW edge: `evaluate-venues cron → AOE per-venue weight registry` | ✓ tracked — documented-only (no consumer code this wave) |

---

## 7. Verdict

**No HALT-class findings.** Proceed to C1-C5 sequential execution under Sequential + Scope Rule + Verification Gate, with the 16-row inline-fix list (§5 above) applied transparently per chapter. Save status flag at start of each chapter execution.

**Awaiting architect approval** before C1 begins.

If approved: C1 starts with `migrations/002_venues_table.sql` + `migrations/003_seed_venues_promoted.sql` + `src/lib/venue-store.ts` + `src/types.ts` `VenueStatus` type widening.
