# ACTIVATION-NUDGE-W1 — Step-0 endpoint-truth (Plan-Mode HALT-class)

**Probed:** 2026-06-18 · single-session · code-repo `~/code/crypto-quant-signal-mcp` @ `8134d40` (v1.20.1) · live container `crypto-quant-signal-mcp-mcp-server-1`

**Verdict: STALE-PREMISE HALT (≥3 stale primitives) → reduced scope = edit-in-place, NOT merge-from-experiments.**
Identical shape to CONVERSION-MEASUREMENT-W1's Step-0 HALT: the spec's "held / un-deployed / merge from `experiments/`" framing is stale — the nudge code is already merged AND deployed live. Awaiting architect ratification before any state mutation.

---

## A. Spec-primitive truth table (`claim | reality | resolution`) — each probed with one concrete command

| # | Spec claim | Reality (probe) | Resolution |
|---|---|---|---|
| 1 | Held code in `/experiments/crypto-quant-signal/.../src/lib/tier-warning.ts` — MERGE + deploy | `find experiments -name tier-warning.ts` → **EMPTY**. It lives at canonical `src/lib/tier-warning.ts` (from **ACTIVATION-PAYWALL-W1**), wired into 3 tool handlers. | **FICTIONAL location.** No merge-from-experiments. Edit the already-merged file in place. |
| 2 | "already-written, **un-deployed** 80% soft nudge" | `ssh … docker exec … grep -c "free calls this month" /app/dist/lib/license.js` → **1**. `getUpgradeHint` 80% branch (`pctUsed >= 0.8`) is **LIVE at v1.20.1**. | **STALE.** Already deployed. Real work = replace the COPY (no track-record, no live values, `upgrade_from=quota`). |
| 3 | `_algovault.upgrade_hint?: string` (held) | `types.ts:174` field EXISTS; assigned in `get-trade-call.ts:474`, `scan-funding-arb.ts:342`, `get-market-regime.ts:289`, `webhook-api.ts:294`. **LIVE.** | Field exists. Re-target its content, don't recreate. |
| 4 | Pure `withTierWarning(meta, ctx)`, 75/90 thresholds, free-only | EXISTS exactly (`tier-warning.ts`). `SOFT_THRESHOLD=0.75`, `HARD_THRESHOLD=0.90`. Already emits `quota_hit_soft`/`quota_hit_hard`. `tier-warning.js` present in container. | Confirmed. See identifier-diff Q1 (75 vs 80). |
| 5 | Emit "events **C1 defined** (`quota_hit_soft`, `first_non_hold_verdict`)" | `quota_hit_soft` was defined+deployed by **ACTIVATION-FUNNEL-AUDIT-W1** (not C1) and already fires from `withTierWarning`. C1 only added `first_non_hold_verdict` (`aha-event.js` present in container). Both LIVE. | Attribution drift only. Both already emit; align the soft threshold (Q1). |
| 6 | Rebase on CONVERSION-MEASUREMENT-W1 C1's emit-hook commit | `git merge-base --is-ancestor b904a1a HEAD` → **true**. Local HEAD `8134d40` already includes C1 (`b904a1a`) + C2/C3. | **Already rebased.** No action. Working tree clean (2 untracked audit/napkin files only). |
| 7 | Track-record SoT = live `/api/performance-public` (PFE-only); never hardcode | `curl … /api/performance-public \| jq .overall` → `{totalCalls:246331, totalEvaluated:245527, pfeWinRate:0.9156671160401911}`. **PFE WR is NESTED at `.overall.pfeWinRate` (fraction), NOT top-level.** Top-level `totalCalls=246331`, `asset_count=860`. | Use `.overall.pfeWinRate × 100` → **91.6** and `totalCalls` → **246,331** (matches landing `data-tr-field="pfe_wr"`/`"call_count"`). |
| 8 | 100% `TIER_LIMIT_REACHED` message to enrich | `errors.ts:103` `TierLimitReachedError` super() = `"…Upgrade for **unlimited** access: <url>"`. `grep -c "for unlimited access" /app/dist/lib/errors.js` → **1 (LIVE)**. ALSO `getQuotaExhaustedMessage` (license.ts:616) used by `scan_trade_calls`. | **"unlimited" VIOLATES the no-"unlimited" copy rule** (live). Both surfaces enriched via ONE shared builder. |
| 9 | TG bot "Upgrade" HTML button in `/start` | In the **separate `algovault-bot` repo** (`/Users/tank/algovault-bot`, Python; rsync→`/opt/algovault-bot` + `systemctl restart`). `messages.py:56` inline `<a href=…>Upgrade</a>` via `signup_url("start_welcome")` (utm, **no `upgrade_from`**, no track-record line). | Cross-repo (see Q3). Add track-record line + `upgrade_from=tg_start`. Static copy (no live-value injection needed). |

**`email.ts:128` latent bug noted (out of scope):** reads top-level `data.pfeWinRate` (undefined) → silently renders the `"90+"` fallback instead of the live 91.6. Masked (90+ is a true floor). Flag as WIS, do NOT fix this wave.

---

## B. Identifier diff (thresholds · upgrade_from · URL params)

| Identifier | Spec | Live code | Decision needed |
|---|---|---|---|
| Soft-nudge **threshold** | upgrade_hint at **≥80%** (req 1, "one threshold; keep it simple") | `getUpgradeHint` message **≥80%** ✅ but `withTierWarning`/`quota_hit_soft` **≥75%** | **Q1** — align `quota_hit_soft` to 80%? |
| Hard threshold | (not specified) | `quota_hit_hard` @ 90% | Keep 90% (structured surface only) |
| `upgrade_from` values | `soft` · `aha` · `limit` · `tg_start` | only `quota` (string msgs) + `tier_limit_reached`/`start_welcome` (utm) | New values; `/signup` captures ANY value as `upgrade_cta_clicked` (`index.ts:1303`) ✅ |
| Signup URL base | `https://api.algovault.com/signup?plan=starter&upgrade_from=<x>` (no utm in copy) | string msgs: `…?plan=starter&upgrade_from=quota` (no utm). `tier_warning` object + TG: carry `utm_*` | **Q2** — drop utm (verbatim) or preserve utm + add `upgrade_from`? |
| PFE WR value/format | `{PFE_WR}%` live | landing renders `(pfeWinRate*100).toFixed(1)`="91.6" | Match landing → **91.6** |
| N value/format | `{N}+` live | landing `call_count`=`totalCalls.toLocaleString()` | **246,331** |

---

## C. system-map edge-touch enumeration (Step 0)

- `makeTradeCallHandler` (`src/index.ts`) — **+ aha upgrade_hint render** (C1 already fires the aha EVENT here; this adds the MESSAGE). Response shape: `_algovault.upgrade_hint` already an allowed key → **no shape change**.
- `getUpgradeHint` (`license.ts`) — copy re-target (80% branch). Internal.
- `TierLimitReachedError` (`errors.ts`) + `getQuotaExhaustedMessage` (`license.ts`) — copy re-target via ONE shared builder. Error-envelope `message`/`suggested_upgrade_url` values change; **keys unchanged**.
- **NEW** `track-record-snapshot.ts` — cached `{pfeWr, callCount}` reader of `/api/performance-public.overall` (background-warmed + static fallback). New internal consumer edge of the existing endpoint.
- `algovault-bot/messages.py` — TG `/start` copy (cross-repo, separate deploy).
- **No new public response key. No DB migration. No new endpoint.**

---

## D. Architect-confirm Q-block (copy-paste to Cowork / answer in chat)

```
ACTIVATION-NUDGE-W1 — Step-0 stale-premise HALT (mirrors CONVERSION-MEASUREMENT-W1).
The "held / un-deployed / merge-from-experiments" code is ALREADY merged + LIVE at v1.20.1
(80% nudge, tier_warning, aha event all deployed; the 100% error literally says "unlimited"
today, violating the copy rule). Reduced scope = EDIT-IN-PLACE the deployed functions +
add the genuinely-missing pieces. Confirm scope + 3 decisions:

Q1 (soft threshold). The 80% upgrade_hint MESSAGE and the quota_hit_soft EVENT fire at
   DIFFERENT thresholds today (message ≥80% via getUpgradeHint; event ≥75% via withTierWarning).
   status.md pre-flagged "SOFT_THRESHOLD 75→80 = ACTIVATION-NUDGE-W1's call."
   → Retune SOFT_THRESHOLD 0.75→0.80 so quota_hit_soft + the soft tier_warning band align with
     the 80% message (one threshold; event = "soft nudge actually shown")? HARD stays 0.90.
   [RECOMMEND: YES — measurement-honest; matches "one threshold; keep it simple".]

Q2 (signup URL utm). Approved copy URLs are bare `?plan=starter&upgrade_from=<x>` (no utm).
   The string messages already have no utm — clean verbatim. But the tier_warning OBJECT's
   suggested_upgrade_url and the TG button carry utm_* for Stripe attribution.
   → (a) verbatim everywhere (drop utm), or (b) preserve utm + ADD upgrade_from (keeps both
     attribution chains)?
   [RECOMMEND: (b) for tier_warning object + TG button (don't break utm); bare verbatim for the
     three human-facing string messages, since the spec gives them verbatim.]

Q3 (cross-repo TG scope). The /start enrichment is in the SEPARATE algovault-bot repo (Python;
   rsync + systemctl restart — different pipeline than the MCP container; tg_bot_upgrade_clicked
   funnel wiring is deferred to OPS-FUNNEL-STRIPE-PIXEL-W1).
   → Ship the TG /start copy + upgrade_from=tg_start this wave as a separate commit+deploy, or
     split to a follow-up?
   [RECOMMEND: in-scope this wave (spec mechanic 3 lists it + gives approved copy); separate commit.]

Q4 (aha vs soft precedence — FYI, will default unless you object). If a free session's FIRST
   non-HOLD coincides with ≥80% quota (near-impossible: non-HOLD calls are what consume quota, so
   the first non-HOLD is ~call #1), the single upgrade_hint shows the AHA copy; soft fires on later
   calls. [DEFAULT: aha wins.]
```

**No code edit / commit / deploy until Q1–Q3 answered.** On approval: edit-in-place + new track-record-snapshot module + aha render + TG copy + tests + status.md + 3 WIS.
