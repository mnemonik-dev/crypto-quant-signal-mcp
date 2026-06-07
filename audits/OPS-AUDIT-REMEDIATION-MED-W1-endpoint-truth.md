# OPS-AUDIT-REMEDIATION-MED-W1 — endpoint-truth.md (Step 0 / Plan-Mode)

**Wave:** OPS-AUDIT-REMEDIATION-MED-W1 (retires the 5 remaining MED findings of SECURITY-AUDIT-RECENT-FEATURES-W1 — fully remediating the audit). **Author:** single-session lead · 2026-06-07.
**Gate verdict:** ✅ **CLEAN — proceed** (architect pre-approved; Mr.1 confirmed SV-01=auth-gate). 0 anchor mismatches; **no public consumer of `/api/performance-shadow`** (the SV-01 HALT risk — cleared); transport live; no destructive surprise.

## 1. Clone / HEAD / transport
| Check | Result |
|---|---|
| clone @ origin/main | `80eafa4` (== origin/main; clean tree) — the MCP-binding deploy |
| transport | host `git@github-funnel:` deploy key **WRITE confirmed** (dry-run ✓); host HEAD `80eafa4` |

## 2. Fix-site re-grep (`claim | reality`) — 0 mismatches
| Finding | Site (re-grepped) |
|---|---|
| SV-02 | `/api/performance-public` handler `src/index.ts:1469`; **fail-OPEN** = `let filteredByExchange = stats.byExchange` (:1512, unfiltered default) + `if (promotedIds.size > 0)` skip (:1519) + catch keeps unfiltered (:1524-26) |
| SV-01 (shadow EP) | `/api/performance-shadow` handler `src/index.ts:1550` (`_req`, **no auth**); leaks `min_buy_sell_sample` (:1562) + `last_eval_*` (:1566-68) |
| SV-01 (mcp://venues) | resource builder `src/index.ts:779-815`; leaks `min_buy_sell_sample` (:798) + `last_eval_at/_pfe_wr/_buy_sell_count` (:803-805); description prose (:783) also names them |
| SV-01 (auth reuse) | `src/lib/webhook-api.ts` — `resolveOwner(req)`→`{license, ownerKey:license.key??null}` + `authRequired(res)` → `401 {ok:false, code:'auth_required', suggested_action}` (the pattern to reuse) |
| SV-03/04 | `src/lib/adapters/_upstream-fetch.ts:103` `.json()` BLIND (no size cap); `parseFloat` sites in **`aster.ts`** (95-99/114/119-123/135/153/164) + **`edgex.ts`** (187-191/209) — NOT in `_upstream-fetch` |
| miss-DoS | `src/lib/equities/equity-misses.ts:18` unbounded `INSERT` (already fail-open/never-throws ✓) |

## 3. Consumer census (Step-0.3 — the SV-01 HALT gate) — CLEAR
- **`/api/performance-shadow` has NO public consumer:** `grep -rn performance-shadow landing/ scripts/ examples/` = **0**; only refs = the handler + a `venue-store.ts` comment + `docs/RUNBOOK-VENUE-SHADOW-ONBOARDING.md` (an OPERATOR runbook with an unauth `curl` at :251 — internal, not a public consumer). → **auth-gating is safe; no public-stripped variant needed.** Companion fix: update the runbook curl to send `Authorization: Bearer <key>`.
- **`min_buy_sell_sample` consumers are internal-only:** `types.ts` (type), `seed-shadow-venues-w3a.ts` (seed log), `evaluate-venues.ts` (promotion state machine) — all read the DB row directly, NOT the public response. → stripping it from the 2 public surfaces breaks nothing.

## 4. Fix design (per finding)
- **R1 SV-01:** auth-gate `/api/performance-shadow` (reuse the webhook pattern — `resolveLicense(req.headers)`; `!license.key` → 401 `authRequired` shape). NEW exported pure formatter module (`src/lib/venue-public-formatter.ts`): `VENUE_FORBIDDEN_KEYS = [min_buy_sell_sample, last_eval_at, last_eval_pfe_wr, last_eval_buy_sell_count, outcome_return_pct]` + `formatShadowVenuePublic(v, ex, nowSec)` + `formatVenueForResource(v)` — allow-list BY CONSTRUCTION (forbidden keys never read into output). `/api/performance-shadow` + `mcp://venues` both use it (mcp://venues stays publicly readable, just stripped); update the mcp://venues description prose. 2 shape-snapshots (`audits/performance-shadow-shape-snapshot-2026-06-07.json` + `audits/mcp-venues-shape-snapshot-2026-06-07.json`, `allowed_keys`/`forbidden_keys`/`consumers`/`drift_check_command`). No-data-loss diff-gate on the legitimately-public fields.
- **R2 SV-02:** fail-CLOSED `/api/performance-public` — default `filteredByExchange = {}` (NOT `stats.byExchange`); ALWAYS filter to `promotedIds` (drop the `if (promotedIds.size>0)` skip → empty-promoted = empty, never all); catch → `filteredByExchange = {}` + log fail-CLOSED. Happy path (5 promoted) byte-identical. Makes `performance-public-shadow-filter.test.ts` GREEN (baseline 15→14 fail).
- **R3 SV-03:** `MAX_UPSTREAM_BYTES` (~8 MB const) in `_upstream-fetch.ts`; reject early on `content-length > cap`; replace `.json()` with a `readJsonCapped(res, controller, cap)` that streams `res.body`, counts bytes, `controller.abort()`+throws on overflow, then `JSON.parse`. Overflow → structured error (treated as upstream failure → existing retry/3-tier fallback). **SV-04:** exported `safeUpstreamNum(x): number|null` (default-deny `!Number.isFinite` → null) in `_upstream-fetch.ts`; adopt in `aster.ts`+`edgex.ts` (skip invalid candles / default-deny invalid critical fields). Generator: every adapter inherits both (state ASTER/EDGEX + future in the commit body).
- **R4 miss-DoS:** in `equity-misses.ts`, BEFORE the INSERT: per-symbol cooldown (skip if same symbol inserted < `COOLDOWN_SEC` ago) + a global per-window cap (skip if ≥ `WINDOW_CAP`/`WINDOW_SEC`); default-deny (skip) on overflow; cap the in-memory dedup Map size (evict expired). No schema change (prompt-preferred). Preserve the existing try/catch never-throws.
- **R5:** per-fix tests + `security-canary.mjs` all-green.

## 5. Rollback (verbatim)
`cd ~/code/crypto-quant-signal-mcp && git revert --no-edit <miss-sha> <upstream-sha> <sv02-sha> <sv01-sha> && scripts/deploy-direct.sh && scripts/deploy-direct.sh --verify-only` (target prior live `80eafa4`; any additive table left in place; confirm markers ABSENT + `/api/performance-shadow` back to prior + `tools/list`=9).

## 6. Commits (5, per-finding): SV-01 · SV-02 · SV-03+04 · miss-DoS · snapshots/docs.
