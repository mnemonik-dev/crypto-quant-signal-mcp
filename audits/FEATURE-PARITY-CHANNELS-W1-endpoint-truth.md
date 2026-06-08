# FEATURE-PARITY-CHANNELS-W1 — Plan-Mode Step-0 endpoint-truth

**Probed:** 2026-06-08 · both repos @ `origin/main` (MCP `4e7dad1`, bot `4313004`; both clean, 0 ahead/behind) + LIVE prod (`https://api.algovault.com`, container `crypto-quant-signal-mcp-mcp-server-1`, pg `crypto-quant-signal-mcp-postgres-1`).
**Verdict:** ✅ **0 fictional primitives.** Every spec-cited primitive EXISTS and was live-verified. The spec is accurate (authored right after FEATURE-REGISTRY-SOT-W1 by the same architect). **2 design-confirm questions** below (neither is a fictional-primitive HALT) — both touch a frozen/contracted surface, so per the project flow I HALT for architect ratification before CH1.

---

## Risk markers present (Plan-Mode self-initiation justified)

cross-host orchestration (MCP host + bot host) · external first-use (scheduled `scan_digest` push; bot `/capabilities` fetch) · identifier cited >1 place (`scan_digest`, `cadence`, tf→cadence map across CH1/CH2/CH4) · ≥4 chapters (5) · live payment/delivery surfaces. **Destructive ops: NONE** — wave is strictly additive (new column, new table, new event-type union member, channel-flag flips, new command).

---

## Probe truth-table (`claim | reality | resolution`)

### Spec Step-0 probe 1 — Registry adapter fields
| Claim | Reality | Resolution |
|---|---|---|
| `FeatureSpec` may lack `webhookEvent`/`botCommand` (CH1 adds if absent) | **Already present** — `feature-registry.ts:39-42` (`botCommand?: string` + `webhookEvent?: string`). `get_trade_call.webhookEvent='trade_call'` (`:74`), `get_market_regime.webhookEvent='regime_shift'` (`:84`) already populated. `scan_trade_calls` (`:100-107`) has NEITHER field + `channels {mcp:true, httpX402:false, bot:false, webhook:false}`. | CH1 = ADD `webhookEvent:'scan_digest'` + `botCommand:'/scan'` to `scan_trade_calls` + flip `channels.{webhook,bot}=true`. No interface change. |

### Spec Step-0 probe 2 — Webhook event model + producer + scheduler
| Claim | Reality | Resolution |
|---|---|---|
| `WebhookEventType` exists | `webhooks-store.ts:27` — `'trade_call' \| 'regime_shift'`. | CH1 adds `'scan_digest'` to the union. |
| `VALID_EVENTS` is a hardcoded 2nd list (the bug) | **Confirmed** — `webhook-api.ts:31` `VALID_EVENTS: WebhookEventType[] = ['trade_call','regime_shift']` (hand-maintained). `parseEvents` (`:88`) + the 400 error copy (`:180`) reference it. | CH1 = DERIVE `VALID_EVENTS` from the registry (webhook-flagged tools' `webhookEvent`), keep `parseEvents` shape. The error-copy string at `:180` also needs to derive (or it drifts). |
| `WebhookEventData` is the digest-able shape | **Single flat interface** (`webhooks-store.ts:36-48`), trade_call/regime-shaped (`coin/call/confidence/regime/...`). NOT a union. | CH1 = make it a **discriminated union** on `type`: existing `TradeCallRegimeEventData` + NEW `ScanDigestEventData {type:'scan_digest', cadence, timeframe, exchange, calls: ScanCallItem[], generated_at}`. `webhook-delivery.ts` payload builder must narrow on `type` (impl detail — see Design D3). |
| `enqueueDelivery` exists; idempotent | `webhooks-store.ts:237` — `INSERT … ON CONFLICT (subscription_id,event_id) DO NOTHING RETURNING id`. The atomic claim. | scan_digest idempotency rides this: `eventId = scan_digest:<subId>:<cadenceBucketEpoch>` → a 2nd tick in the same bucket is a no-op. No new idempotency primitive. |
| The REAL trade_call/regime producer (cleanest scheduler hook) | `onSignalRecorded` (`webhook-events.ts:240`), fire-and-forget from `recordSignal` post-insert, gated `WEBHOOK_DELIVERY_ENABLED`. Delivery worker = **in-server `setInterval`** (`webhook-delivery.ts:397` `startDeliveryWorker` → `deliverPending`), wired `index.ts:2388-2391` behind the same flag, mirroring the backfill `setInterval` (`index.ts:2381`) + grid-warmer (`:2410`). | **Decision D1: CH2 scheduler = in-server `setInterval`** (a sibling of the delivery worker in `index.ts`, gated by `WEBHOOK_DELIVERY_ENABLED`). Matches precedent; the MCP server is long-lived (no process-boundary refresh leak). Host-cron rejected (no host-side node entrypoint for this, and it would re-fetch market data in a short-lived proc). |
| Webhook subscription model + DDL location | `WebhookSubscription` (`webhooks-store.ts:60-74`): url/secret/events/assets/`timeframes`(plural)/min_confidence/tier/owner_key/active/consecutive_failures/created_at/last_delivered_at. **No `cadence`, no `top_n`, no singular `timeframe`.** DDL is at `performance-db.ts:644-674` (dual-backend PG+SQLite, both branches; indexes `:676-682`). `getBackend()` `:716`. | CH2 = ADD `cadence` (+ optional `top_n`, + see Q2 re: singular scan `timeframe`) to BOTH DDL branches + SSH-preapply `ALTER TABLE … ADD COLUMN` on prod (the `IF NOT EXISTS` CREATE is a no-op vs the existing table — pre-apply is mandatory, CLAUDE.md). Update `WebhookSubscriptionInput`/`WebhookSubscription`/`mapSubscription`/`createSubscription` INSERT. |
| ⚠️ DDL grep gotcha | `file` mis-detects `performance-db.ts` as **"Nim source code"** → **ugrep silently skips it as binary** → every plain `grep` (even `import`/`export`/`dbQuery`) returned empty, nearly producing a false "no committed DDL" finding. `grep -a` (force-text) reveals all. | **WIS candidate.** Use `grep -a` / `codegraph` / Read on this file; never trust an empty grep here. |

### Spec Step-0 probe 3 — Scan-digest quota
| Claim | Reality | Resolution |
|---|---|---|
| `trackCallByKey` accepts a `units` arg | **Confirmed** — `license.ts:553` `trackCallByKey(trackerKey, tier, units = 1)`; `clampUnits` (`:435`) = `Number.isFinite && ≥1 ? floor : 1` (default-deny, never 0/neg). Sibling `trackCall(license, units=1)` `:504`. | CH2 quota = `trackCallByKey(ownerKey, tier, units = max(1, digest.eligible_non_hold))`. |
| The scanner reports the unit driver | `ScanTradeCallsResult.eligible_non_hold` (`trade-call-scanner.ts:58`) = "the handler's quota-unit driver" (non-HOLD in returned `calls[]`). `calls: ScanCallItem[]` (`:65`) is the allow-listed projection (`toScanCallItem` `:93`). | Digest `calls` = `result.calls`; units = `result.eligible_non_hold` (≥1 floor). |

### Spec Step-0 probe 4 — Cadence
| Claim | Reality | Resolution |
|---|---|---|
| `timeframe` is a per-subscription field | **NO singular `timeframe`** — the sub has `timeframes` (plural, an event-MATCH filter for trade_call/regime). The scanner takes a SINGULAR `timeframe` (`ScanTradeCallsParams.timeframe?`, `trade-call-scanner.ts:70`). Cadence default = `cadenceForTimeframe(timeframe)` needs ONE tf. | **→ Q2.** Impedance mismatch: plural filter vs singular scan tf. Recommend a dedicated nullable singular scan-`timeframe` column. The tf→cadence map (1m–1h→1h, 2h–4h→4h, 8h–1d→1d, floor 1h) is DECIDED by Mr.1 — implemented as a total, floored pure fn (`cadenceForTimeframe()`), unit-tested. |

### Spec Step-0 probe 5 — Bot surface seams
| Claim | Reality | Resolution |
|---|---|---|
| `call_tool` / `from_env` exist | `mcp_client.py:198` `call_tool(name, arguments)`; `:227` `from_env()` (internal-bypass header → `tier:'internal'`). `read_resource` `:172`. **No `fetch_capabilities()`.** | CH3 adds `fetch_capabilities()` → GET `/capabilities`. NOTE: `/capabilities` is a **sibling HTTP endpoint, not `/mcp`** — must derive base from `ALGOVAULT_MCP_URL` (strip `/mcp`) or a new env. Commit `capabilities-fallback.json` snapshot; fail-open. |
| Command registration seam | `handlers.py:520` `register_handlers(app, db)`; `app.add_handler(CommandHandler("watch", _watch))` etc. `:953-977`. `/help`=`_help`, `/start`=`_start`. | CH3 adds `CommandHandler("scan", _scan)`; CH4 adds `scanwatch`/`unscanwatch`. /help+/start copy gains `/scan`. |
| Bot picks its 2 alert types (hardcoded?) | **Confirmed hardcoded** — `validators.py:42` `ALERT_TYPES = frozenset({"regime","calls","both"})` + `normalize_alert_type` (`:78`); `watchlists` CHECK `alert_type IN ('regime','calls','both')` (`db.py:44-45`). These are BOT-DOMAIN values, not tool names. | **→ Q1.** Map bot-flagged canonical tools → bot surface (`get_trade_call`→`calls`, `get_market_regime`→`regime`, `scan_trade_calls`→`/scan`+`/scanwatch`). The watchlists CHECK is NOT widened (scan is a pull command + a separate CH4 table, not a watchlists `alert_type`). |
| `consume_quota` accepts units | `quota.py:146` `consume_quota(db, chat_id)` — **NO units arg**; increments `state.used + 1` (`:162`). `PAID_TIERS` no-op (`:160-161`), 100/mo cap (`:40`). | CH3 = extend to `consume_quota(db, chat_id, units = 1)` (clamp ≥1; default = byte-identical for existing callers). 100/mo + PAID_TIERS untouched. |

### Spec Step-0 probe 5b — Bot scheduled scan-digest
| Claim | Reality | Resolution |
|---|---|---|
| `/watch` subscription table + add_watch* | `watchlists` table (`db.py:40`, cols chat_id/coin/timeframe/exchange/alert_type/…); `add_watch`/`add_watch_batch`/`remove_watch`/`list_watches`/`list_due_watches`(`:438`)/`update_watch_after_fetch`(`:807`). | CH4 = NEW `scan_watches` table mirroring this + add/remove/list/list_due helpers. |
| The alert-engine cron loop | `run_cycle(token, db_path, mcp_url, bypass_key)` (`alert_engine.py:648`) → `process_one_row` (`:364`). Entry `main()` (`:741`) **"invoked by systemd timer every 1 min"**; `asyncio.run(run_cycle(...))` (`:766`). One-shot process ("cross-tick state lives on disk", `:578`). | CH4 = per-cadence scan-digest producer inside `run_cycle` (due-check by cadence bucket). **1-min tick → on-disk per-bucket idempotency is mandatory** (a last-fired marker on the new table; never double-fire/charge within a bucket). |
| Bot needs its own `cadenceForTimeframe` | None exists. | CH4 = small pure Python `cadenceForTimeframe` MIRRORING the MCP one. **Shared-logic candidate** (2nd implementor) — flag for `/capabilities`-exposure at the 3rd consumer (CLAUDE.md 3-example rule); do NOT extract now. |

### Live contract probe — `GET /capabilities` (HTTP 200)
| Claim | Reality | Resolution |
|---|---|---|
| Frozen W1 contract `{name,canonical,channels,quota,x402,description,enabled}` | **Confirmed** — `.tools[0]\|keys` = `[canonical, channels, description, enabled, name, quota, x402]`. Top-level `{server, tools, version}`, 9 tools. | The projection **does NOT expose `webhookEvent`/`botCommand`** (internal-only). → **Q1** (bot can derive WHICH tools are bot-flagged via `channels.bot`, but not the command string). |
| Pre-wave channel flags | `scan_trade_calls`: `{mcp:true, httpX402:false, bot:false, webhook:false}`, `webhookEvent:null`, `botCommand:null`. `get_trade_call`/`get_market_regime`: bot✓ webhook✓. | Matches the registry + the spec's "current flags." CH1 flips scan bot/webhook → true. |

---

## Deploy-readiness (live-probed)

| Fact | Value | Impact |
|---|---|---|
| `WEBHOOK_DELIVERY_ENABLED` (prod) | **`true`** | Delivery worker is LIVE → scan_digest webhooks deliver once CH1/CH2 land; CH2's live gate (`POST /api/webhooks {events:['scan_digest']}` + scheduler tick → delivered row) is runnable as written. |
| Live `webhook_subscriptions` columns | id,url,secret,events,assets,timeframes,min_confidence,tier,owner_key,active,consecutive_failures,created_at,last_delivered_at | **Byte-matches committed DDL** (perf-db:644-674). |
| `cadence`/`top_n` present in prod? | **No (count=0)** | No prior partial work. CH2 SSH-preapplies `ALTER TABLE … ADD COLUMN` (`docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance`), with an `information_schema.columns` pre-check. |
| GHA / account flag | account UN-flagged (both repos push clean @ origin/main); GHA auto-deploy still down (per status.md). | **MCP deploy = `scripts/deploy-direct.sh`** (git-reset host→origin/main + rebuild + recreate). **Bot deploy = push + host `/opt/algovault-bot` pull/rsync + `systemctl restart algovault-bot.service`** (editable-install). Worktree-first per repo. |
| Tool count | `tools/list`=9 | UNCHANGED (no new MCP tool; scan_trade_calls already exists — only channel reach flips). |

---

## Design decisions (pre-resolved; architect may override)

- **D1 — Scheduler primitive = in-server `setInterval`** (CH2), sibling to the delivery worker in `index.ts`, gated by `WEBHOOK_DELIVERY_ENABLED`. (vs host-cron.)
- **D2 — Idempotency** rides the existing `enqueueDelivery` ON-CONFLICT via `eventId = scan_digest:<subId>:<cadenceBucketEpoch>`; bot side uses an on-disk last-fired-bucket marker on the new `scan_watches` table.
- **D3 — `WebhookEventData` → discriminated union** on `type`; the delivery payload builder (`webhook-delivery.ts`) narrows on `type`. Existing `trade_call`/`regime_shift` event-data + deliveries stay byte-identical (additive variant only).
- **D4 — CH5 canary** webhook-event parity lives in **`--check` (static)** mode: it imports dist (`feature-registry` + `webhook-api`) and asserts `VALID_EVENTS` == the registry's webhook-flagged `webhookEvent` set. (`--live` HTTP can't see `VALID_EVENTS`; the projection omits `webhookEvent`.)
- **D5 — `VALID_EVENTS` error-copy** (`webhook-api.ts:180`, the `invalid_events` 400 message) must derive from the registry too, or it drifts from the computed set.
- **D6 — `consume_quota(units=1)`** default keeps every existing bot caller byte-identical; PAID_TIERS no-op + 100/mo cap untouched.

---

## ⚠️ Architect-confirm questions (HALT — do NOT proceed to CH1 until answered)

Both touch a contracted surface (the frozen `/capabilities` shape · the webhook subscription data-model). My recommendation is in each — confirm or redirect.

```
Q1 — /capabilities does NOT expose botCommand/webhookEvent (keys = name,canonical,channels,
     quota,x402,description,enabled — the frozen W1 contract). So the bot (CH3) can derive
     WHICH tools are bot-flagged (channels.bot==true) but NOT the command string. Two reads of
     CH3 "derive surface from the projection" + CH5 "bot command/alert set == bot-flagged set":
       (A) [RECOMMEND] Keep the frozen contract. Bot derives the bot-flagged SET from
           channels.bot, maps each canonical tool → its bot surface via a small bot-side table
           (get_trade_call→"calls" alert, get_market_regime→"regime" alert,
           scan_trade_calls→/scan + /scanwatch). CH5 canary asserts SET COVERAGE (every
           bot-flagged tool has a bot surface; a future bot-flagged tool fails until mapped).
       (B) Expose botCommand (+ webhookEvent) in projectCapabilities() so the bot reads commands
           directly — but this WIDENS the frozen /capabilities contract (new public keys) +
           changes the public-shape snapshot. Contradicts the spec's frozen-contract line 14-16.
     → A or B?  (A preserves the frozen contract; B is fully data-driven but breaks the freeze.)

Q2 — The webhook subscription has `timeframes` (PLURAL, an event-match filter), no SINGULAR
     scan timeframe. But scan_digest runs scanTradeCalls() at ONE timeframe, and cadence
     defaults to cadenceForTimeframe(timeframe) — singular. CH2 scope says "reuse timeframes as
     a scan filter," but a plural filter can't drive a single-tf scan + cadence default.
       (A) [RECOMMEND] Add a dedicated nullable singular `timeframe` column for scan_digest subs
           (default = scanner default 15m → cadence 1h); keep `timeframes` (plural) as the
           trade_call/regime match-filter (irrelevant to scan_digest).
       (B) Repurpose timeframes[0] for scan_digest (require exactly one timeframe entry).
     → A or B?
```

---

## system-map edge enumeration (probe 6)

**MCP repo:** registry SoT mutation (scan_trade_calls webhookEvent/botCommand + bot/webhook=true) · NEW internal derive edge `webhook-api.VALID_EVENTS ← feature-registry` · NEW `scan_digest` WebhookEventType + WebhookEventData union member · NEW scheduled producer edge `scan-digest-scheduler(setInterval) → scanTradeCalls → enqueueDelivery(scan_digest) → scan_digest subscribers` (parallel to the `onSignalRecorded` post-insert producer) · `webhook_subscriptions += cadence(+top_n[,timeframe])` column · existing quota edge new caller `scan_digest delivery → trackCallByKey(units=max(1,eligible_non_hold))`.
**Bot repo:** NEW startup consumer edge `mcp_client.fetch_capabilities() → GET /capabilities` (static `capabilities-fallback.json`) · bot tool-backed surface DERIVES from the bot-flagged projection (replaces hardcoded `ALERT_TYPES` coupling) · NEW `/scan → call_tool('scan_trade_calls') → consume_quota(units)` (existing internal-bypass edge, new caller) · NEW `scan_watches` table + `/scanwatch`/`/unscanwatch` · `run_cycle` gains a per-cadence scan-digest producer → chat push.
**Canary:** `check-feature-registry-drift.mjs --check` += webhook-event parity assertion · bot-repo CI test asserts bot surface == `/capabilities` bot-flagged set.

---

## Per-chapter readiness (post-approval)

- **CH1** (MCP): registry fields on scan_trade_calls + flags; `WebhookEventType += scan_digest`; `WebhookEventData` union; `VALID_EVENTS` (+ error copy D5) derive from registry. Gate: build + `vitest run webhook` + `/capabilities` scan.webhook==true.
- **CH2** (MCP): `cadence`(+Q2) column (SSH pre-apply + DDL both branches) + `cadenceForTimeframe()` + in-server scheduler + delivery + quota `max(1,N)` + bucket idempotency. Gate: live POST + tick → delivered + quota +N + replay no-op.
- **CH3** (bot): `fetch_capabilities()` + fallback snapshot + derived surface (Q1) + `/scan` + `consume_quota(units)`. Gate: pytest + live `/scan` smoke metering.
- **CH4** (bot): `scan_watches` + `/scanwatch`/`/unscanwatch` + per-cadence producer + `cadenceForTimeframe` (Py). Gate: pytest + harness cron-tick fires + meters.
- **CH5**: canary `--check` webhook-event parity + bot derive-test + runbook + system-map. Gate: canary live rc=0 + simulated-drift rc=1 + bot derive-test green.

_Worktree-first per repo at execution (`scripts/cc-session.sh new` / `git worktree add`). Per-file `git add`. Each chapter prints `FEATURE_PARITY_CHANNELS_W1_CH<N>_GREEN`._
