# REFERRAL-INPRODUCT-NUDGE-W1 — Plan-Mode Step-0 endpoint-truth

**Wave:** extend the LIVE ACTIVATION-NUDGE generator with a referral arm at the value moments (limit wall primary, aha light) across MCP (C1) + bot (C2).
**Discipline:** EDIT-IN-PLACE — the nudge framework is DEPLOYED (v1.20.1+), re-probed live (mirrors ACTIVATION-NUDGE's stale-premise discipline). Base: `origin/main` = `f68169d` (worktree off it).
**Verdict:** ✅ Every spec anchor is LIVE and matches. ZERO fictional primitives → no HALT. Two findings reshape execution (below). Awaiting copy + product-decision ratification.

---

## A. LIVE-framework re-probe — `claim | reality | resolution`

| # | Spec claim (anchor) | Reality (live probe) | Resolution |
|---|---|---|---|
| 1 | `nudge-copy.ts` `buildSoftNudge`/`buildAhaHint`/`buildLimitMessage` (pure CTA builders, `upgrade_from`) | LIVE. `UpgradeFrom='soft'\|'aha'\|'limit'` (L29); `nudgeSignupUrl(from)` (L32); `NudgeStats{pfeWr,callCount}` (L37); the 3 builders take `NudgeStats` only (no key/code). nudge-copy imports **nothing heavy** (only local consts `SIGNUP_BASE`, `TRACK_RECORD_URL`). | EDIT-IN-PLACE. Add referral arm by extending `buildLimitMessage`/`buildAhaHint` signatures with an optional pre-derived `referralCode: string\|null`; import `shareLink` + `bonusCallsLabel` from `referral-constants` (PURE). nudge-copy stays light. |
| 2 | `errors.ts` `TierLimitReachedError` → `buildLimitMessage` (the 100% wall; 4 throw sites inherit) | LIVE. Ctor (L94) calls `buildLimitMessage({total, ...getTrackRecord()})` (L115) — **no key**. Throw sites (4): `get-trade-call.ts:109`, `get-market-regime.ts:42`, `scan-funding-arb.ts:149`, **`equities/equity-tool-formatters.ts`** (the spec's 4th). Each has `license.key` in scope. | Add `referralCode?: string\|null` to ctor args → pass to `buildLimitMessage` + build a stored `referral_hint`. Each throw site passes `license.key ? deriveUserCode(key) : null`. Single-source string preserved. |
| 3 | `getQuotaExhaustedMessage` 2nd limit path | LIVE `license.ts:751` — sig `(used,total)`, **no key**. ONE real caller: `scan-trade-calls.ts:110` (returns a `ScanQuotaExhaustedResponse` with `message`+`suggested_action`; has `license.key`). | Extend `getQuotaExhaustedMessage(used,total,referralCode?)`; scan-trade-calls passes the code + gets the additive `referral_hint` in its response. |
| 4 | `aha-event.ts` `recordFirstNonHoldVerdict`→`isAha` single-source, rendered at `makeTradeCallHandler` | LIVE. `index.ts:417` `const isAha = recordFirstNonHoldVerdict(...)`; L430 `if (isAha) meta.upgrade_hint = buildAhaHint(getTrackRecord())`. Handler resolves `const license = getRequestLicense()` (L392) → **`license.key` available** (used L736/742). | Reuse `isAha` (NO re-impl). Keyed aha → `meta.upgrade_hint = buildAhaReferral(stats, code)` + `meta.referral_hint`. Keyless aha → byte-unchanged (`buildAhaHint`). ONE hint/call. |
| 5 | `AlgoVaultMeta.upgrade_hint` — structured nudge field; `referral_hint` rides here allow-listed | The meta is loosely typed inline (`_algovault?:{upgrade_hint?:string}` L431); the **success** path mutates `meta.upgrade_hint`. The **limit** path is an ERROR via `toolErrorContent(err)` (`index.ts:142`); the `TierLimitReachedError` branch (L170-181) builds an inline allow-listed payload. | Aha (success): `meta.referral_hint = buildReferralHint(...)`. Limit (error): add `referral_hint: err.referral_hint` to the L171 payload. Both via ONE typed pure builder `buildReferralHint({from,code\|null})` → `{cta,link_or_path,bonus_calls,from}` (the "allow-list formatter + interface + test", mirroring exported `buildInsufficientCandlesPayload`). |
| 6 | keyed link via `deriveUserCode(key)` + `shareLink()`; keyless = get-your-link path | LIVE. `deriveUserCode(apiKey)` `referral-store.ts:228` (pure HMAC, cheap). `shareLink(code)` `referral-constants.ts:45` → `https://algovault.com/join?ref=<code>` (the 200 give-get page; the old `signup?ref=` 400'd). | Keyed → `shareLink(deriveUserCode(key))`. Keyless → free-account signup URL (see Finding F2). Derivation is gated (limit = on the wall; aha = `isAha` once/session) → negligible hot-path cost. |
| 7 | `REFERRAL_TERMS` SoT `BONUS_CALLS=500`; track-record from `track-record-snapshot.ts` | LIVE `REFERRAL_TERMS.BONUS_CALLS=500` (`referral-constants.ts:16`); `bonusCallsLabel()→"500"`. Track-record via `getTrackRecord()` (already wired into every builder). | Interpolate `{bonusCallsLabel()}` — grep-gated, ZERO hardcoded `500`. |
| 8 | BOT `paywall.py` (`quota_hit_{soft,hard,block}`) — does the limit/paywall moment already offer referral? | **GAP CONFIRMED.** `format_paywall_body(suggested_upgrade_url,...)` (`paywall.py:94`) offers `/unlock_premium_alerts` (free path) + the Stripe upgrade URL — **no `referral`/`/referral`/`bonus`** anywhere in paywall.py. The bot's `/referral` + TG value-moment nudge (TG-REFERRAL C3) are separate surfaces. | **C2 = real gap, NOT verify-only.** Add the referral option to `format_paywall_body` (reuse `referral.py` renderers + `/api/referral/code`; state-adaptive; trilingual; referral-prominent + upgrade-retained; matches C1). |
| 9 | `tools/list`=9 byte-unchanged | LIVE 9 tools. This wave is message/field-only (no tool add/rename/remove). | Assert `tools/list`=9 byte-identical at the gate. |

## B. Two findings that shape execution
- **F1 — C2 is a real gap (not verify-only).** `paywall.py` offers `/unlock_premium_alerts` + upgrade but no referral. C2 adds the referral option at the bot's limit moment (still Sequential after CH1_GREEN).
- **F2 — keyless "get-your-link" URL.** Keyed users get `shareLink(code)` (`algovault.com/join?ref=`). Keyless users have NO code → the CTA is "create a free account to get YOUR link." The free-account signup base is `SIGNUP_BASE='https://api.algovault.com/signup'` (the paid path is `?plan=starter`; the free path omits it). C1 will use the existing free-key-signup URL tagged `upgrade_from=limit`/`aha` for funnel attribution (grep-confirmed against REFERRAL-FREE-KEY-SIGNUP at edit time; if no distinct free URL exists, fall back to the apex give-get page). **Never a fake link.**

## C. Identifier diff (R-section ↔ AC-section ↔ proposed copy ↔ LIVE) — all MATCH

| Identifier | R / Scope | AC | Copy | LIVE | Verdict |
|---|---|---|---|---|---|
| `BONUS_CALLS` | 500 (L25,60) | "SoT 500" (L67) | `{BONUS_CALLS}` (L108-112) | `REFERRAL_TERMS.BONUS_CALLS=500` | ✅ |
| `referral_hint` keys | `{cta,link_or_path,bonus_calls,from}` (L63) | "additive + allow-listed" (L67) | same 4 (L112) | NEW additive | ✅ (4 keys, no `outcome_*`) |
| `from` enum | `'limit'\|'aha'` (L63) | — | `from` (L112) | `UpgradeFrom='soft'\|'aha'\|'limit'`; `referral_hint.from ⊂ {limit,aha}` | ✅ (subset by design — soft stays upgrade-only, L64) |
| throttle reuse | `isAha` once/session; limit on the wall; NO new store (L41) | — | — | `recordFirstNonHoldVerdict`→`isAha` (idempotent/session); `checkQuota` wall | ✅ (reuse, zero new throttle) |
| `tools/list` | =9 (L40) | =9 (L67,94) | — | 9 | ✅ |

## D. system-map edges (EDIT-IN-PLACE additive)
- MUTATED `nudge-copy.ts`: += referral arm on `buildLimitMessage`/`buildAhaHint` (state-adaptive) + NEW pure `buildReferralHint` + `buildAhaReferral`; consume → `referral-constants` (`shareLink`, `bonusCallsLabel`).
- MUTATED limit moment (`errors.ts` `TierLimitReachedError` + `license.ts` `getQuotaExhaustedMessage`) + 5 call sites (4 throw + scan-trade-calls) += `referralCode`.
- MUTATED aha render (`index.ts:430`) + limit error payload (`index.ts:171`) += `referral_hint`.
- NEW consume edge: nudge-copy → `deriveUserCode` (at the call sites, not in nudge-copy) for the keyed link.
- C2: bot `paywall.py` `format_paywall_body` += referral option → consume `/api/referral/code`.
- Shape snapshots: `get-trade-call` (success `_algovault.referral_hint` + error `referral_hint`) + `scan-trade-calls` (`referral_hint`) — additive.

## F. Expanded-aha Step-0 resolutions (post-ratification, Mr.1 2026-06-22 — 4 triggers, KEYED, ≤1/session)
The aha arm grew from 1 hint to **4 triggers** (Q4). Step-0 probed each; Mr.1 delegated N (scan) + d (verify) to Step-0.

| Trigger | Detection (live-probed) | Decision |
|---|---|---|
| **(a) high-conviction call** | `confidence = round(absScore/MAX_RAW_SCORE*100)` (`get-trade-call.ts:412`, result key `confidence` L498); track-record record gate ~52 (L79). | Reuse `isAha` (free, first non-HOLD/session) **AND `confidence ≥ 70`** (`AHA_HIGH_CONVICTION_CONFIDENCE`, named/tunable — the anti-"random ask" guard) **AND keyed**. isAha+keyless → existing upgrade hint (D, unchanged). `from='aha_call'`. |
| **(b) multi-hit scan** | `result.eligible_non_hold` (`scan-trade-calls.ts:119`); scan `limit` default 10 / max 100. | **N=3** — `eligible_non_hold ≥ 3` AND keyed → `from='aha_scan'`. (≥3 live calls in one scan = a genuine multi-hit; comfortably inside the default 10.) |
| **(c) usage milestone** | Monthly `quota_usage.call_count` (tracker-keyed, persisted `INSERT…ON CONFLICT` `license.ts:539`); free cap 100/mo. No lifetime per-user counter exists. | Milestones **[25, 50]** (free-reachable, tunable). Fire when `call_count` crosses an **unshown** milestone AND keyed → `from='aha_milestone'`. **Lifetime dedup** via a NEW monotonic `milestone_referral_shown INTEGER DEFAULT 0` column on the EXISTING `quota_usage` (extends the per-key store — NOT a new throttle store; survives monthly reset). Migration pre-applied via SSH + `IF NOT EXISTS`/PRAGMA idempotency. Checked in `makeTradeCallHandler` (primary call path). |
| **(d) verification peak** | `server.resource('signal-performance', …, async () => {…})` (`index.ts:834`) takes **no args**, reads **no** `getRequestLicense()`/`getRequestSessionId()`; stateless server, resource reads carry no per-user attribution. `verify://signal/{id}` likewise. | **DEFER** to `OPS-REFERRAL-VERIFY-NUDGE-W{NEXT}` (spec CONDITIONAL — "never fake a view it can't detect"). Ship the (d) copy + `from='aha_verify'` enum value (contract complete) but **wire no call site** this wave; the follow-up wave adds per-user resource-read attribution + the one call site. |

**Session cap (≤1 aha referral/session across a–c):** add a sibling bounded-LRU `Set` + `shouldShowAhaReferral(sessionId)` to `aha-event.ts` (same module/pattern as `emittedSessions` — extends the existing single-source store, **no new throttle store / no new file**). First trigger to pass its gate in a session wins (peak-end); subsequent triggers in that session skip the referral hint. Precedence aha>soft; never stack referral+upgrade+soft on one response.

**`referral_hint.from` enum (Mr.1-confirmed):** `'limit' | 'aha_call' | 'aha_scan' | 'aha_milestone' | 'aha_verify'` (5 values; `aha_verify` shipped-but-unwired pending d).

**Cohort note:** the referral arm needs a code → **keyed only**. (a) inherits `isAha`'s free-only cohort; (b)/(c) fire for any keyed tier. Keyless at every aha moment = byte-unchanged.

## E. Gate invariants (carried into both chapters)
MESSAGE-ONLY (no free-tier gating change) · numbers from SoT (grep-gate, no literal `500`) · `tools/list`=9 byte-unchanged · `content[0]` JSON byte-position preserved (referral string rides existing human item + additive field) · no `outcome_*` · keyless tier byte-identical except the limit/aha message (message-only) · no `send_telegram.sh` (C2 user-facing via the bot only) · per-file `git add` · `CH1_GREEN` before C2 · C1 contract FROZEN before C2.
