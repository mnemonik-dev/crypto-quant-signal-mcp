# OPS-X402-MCP-PRICE-BINDING-W1 — endpoint-truth.md (Step 0 / Plan-Mode)

**Wave:** OPS-X402-MCP-PRICE-BINDING-W1 (closes the MCP-surface residual of SECURITY-FIX-X402-WEBHOOK-W1). **Author:** single-session lead · 2026-06-07.
**Gate verdict:** 🛑 **HALT (license-semantics premise mismatch)** — anchors / transport / primitives / proof-location ALL clean, but the spec's R1/R2 core premise (an "existing MCP payment-required response, no serve") is **factually absent**: the `/mcp` priced tools serve free-tier-within-quota with NO payment gate. The corrected fix behavior is a product decision on a money-moving gate → architect-confirm required before mutation (Q-block below). **Everything else is GO; one confirm unblocks coding.**

---

## 1. Clone / HEAD / transport — CLEAN
| Check | Result |
|---|---|
| clone @ origin/main | `84713c3` (== origin/main; clean tree) — the SECURITY-FIX deploy |
| transport | host `git@github-funnel:` deploy key **WRITE confirmed** (dry-run `[new branch]` ok) → bundle→scp→host-push→deploy-direct live ✅ |

## 2. Anchor re-grep (`claim | reality`) — 0 mismatches
| Spec anchor | Reality |
|---|---|
| `/mcp` gate `resolveLicense` ~index.ts:2071 | `app.all('/mcp', …)` calls `resolveLicense(req.headers)` at **:2071**; settle at **:2198** ✅ |
| `resolveLicense` def | `src/lib/license.ts:110` — 4-tier: internal → **x402** (`verifyX402Payment(headers)` :119, FLATTENED, no tool) → API-key → free ✅ |
| reusable primitives | `verifyX402Payment(headers, toolName?)` (x402.ts:215/217; binds to `toolRequirements.get(toolName)` :238) · `paymentMatchesToolRoute` (:428) · `effectivePrice`/`isPaymentSufficient` (x402.ts) · `extractPaymentNonce` + `tryClaimPayment` (x402-idempotency-store.ts:74) — all present ✅ |
| `processed_x402_payments` | live in prod (pre-applied by 29b8451) ✅ |

## 3. Proof / nonce source (Step-0 q3) — CLEAN
`/mcp` reads the proof from the **`X-PAYMENT` header** on the POST (`resolveLicense(req.headers)` → `verifyX402Payment(headers)` → `headers['x-payment']`) — identical to the HTTP route. So `extractPaymentNonce(pendingSettlement.paymentPayload)` (EIP-3009 `authorization.nonce` + Permit2 fallback) **reuses directly**. The tool name is `req.body.params.name` (available at :2071); the timeframe is `req.body.params.arguments.timeframe`.

## 4. `resolveLicense` semantics (Step-0 q4) — CLEAN as a fact, but CONTRADICTS the spec premise 🛑
**Per-call verify** (not a reusable credit): each request re-runs `verifyX402Payment(headers)`; a valid proof → `{tier:'x402', pendingSettlement}`. ✅ mirrors HTTP.
**BUT — the decisive finding:** the `/mcp` `tools/call` path has **NO payment-required gate**. Priced tools serve to **every tier including free**, gated only by **monthly quota**:
- `getTradeSignal` (src/tools/get-trade-call.ts): serves; `throw TierLimitReachedError` ONLY when `!quota.allowed` (quota exhausted). Free tier has full coin/timeframe access (FREE-UNLOCK-W1) within its 10/mo quota.
- `getMarketRegime`, `scanFundingArb`: same — `trackCall(license)` / quota check; serve all tiers within quota.
- `grep generate402Response|PAYMENT-REQUIRED|402` on `src/index.ts`+`src/tools/` → **only the HTTP route** has a 402/payment-required envelope. The MCP tools/call path has **none**.

**Therefore the x402 payment on MCP is a per-call CHARGE (settle) that grants the higher `x402` tier — NOT a gate that blocks unpaid serves.** The bug (X402-01/02 on MCP) is real: a `$0.01` `scan_funding_arb` proof flattened-matches → `tier='x402'` + `pendingSettlement={$0.01 scan req}` → `get_trade_signal` serves → `settleX402Async` charges **$0.01** for a **$0.02** tool (50% underpay); and one proof can be replayed across N pre-settle `tools/call`s.

**The spec's R1/R2 ("Unpaid/insufficient → the existing MCP payment-required response … no serve"; "Replay → payment-required/error, no serve") is built on a FALSE premise — there is no such MCP envelope.** Two interpretations diverge materially on a money-moving gate → architect must confirm (Q-block).

## 5. Caller census (R4) — generator completeness
- `verifyX402Payment` callers: **ONLY** `license.ts:119` (`resolveLicense`). Single chokepoint → threading `toolName` into `resolveLicense` IS the generator fix; both transports inherit it.
- `resolveLicense` callers: `index.ts:2071` (`/mcp` — UNBOUND, to fix) · `x402-http-routes.ts:169` (HTTP — already bound via its own post-`resolveLicense` `paymentMatchesToolRoute` + claim) · `webhook-api.ts:40` (authz/tier-resolution only — serves no priced tool, no per-tool binding applicable).
- No other flattened/unbound *paid-serve* caller exists.

## 6. Recommended fix (pending architect confirm on §4)
Thread `(tool, timeframe)` into `resolveLicense` (optional params) → when present, `verifyX402Payment(headers, tool)` (per-tool bind) + `tryClaimPayment(extractPaymentNonce(...))` claim-before-grant. On **mismatch (cross-tool/underpay) OR replay OR DB-error/empty-nonce → DO NOT grant `tier:'x402'`** (the proof isn't valid payment for this tool) → the caller **falls through to their API-key/free tier** → the tool serves within THAT tier's quota, **`pendingSettlement` cleared → NO settle (no charge)**. A correct exact/over-price proof → `tier:'x402'` → serve + settle (unchanged). This closes the cross-tool downgrade + replay, **preserves free-tier access** (no new reject-path, consistent with how a no-proof call already behaves), and reuses every shipped primitive. The /mcp handler passes the tool; the HTTP path is untouched (keeps its own post-binding). **This is interpretation (A) in the Q-block.**

## 7. Rollback (verbatim, if it proceeds)
`cd ~/code/crypto-quant-signal-mcp && git revert --no-edit <mcp-idempotency-sha> <mcp-binding-sha> && scripts/deploy-direct.sh && scripts/deploy-direct.sh --verify-only` (target prior live `84713c3`; `processed_x402_payments` additive, leave it).

## 8. HALT RESOLVED — architect confirmed Q1 → **A (downgrade-to-free)** + refinements (2026-06-07)
Proceed. Finalized behavior on a priced MCP `tools/call` (bind the tier-grant/settle in `resolveLicense` to the **called tool's** `effectivePrice` + claim the nonce BEFORE settle):
1. **cross-tool / insufficient proof, free quota REMAINING** → no x402 grant, no settle; serve within the caller's free/non-x402 quota (identical to a no-proof call).
2. **cross-tool / insufficient / replayed proof, free quota EXHAUSTED** → return a structured **`X402_PAYMENT_REQUIRED`** error built from the **called tool's** `paymentRequirements` (REUSE `generate402Response(tool)` → exact amount/asset/network/payTo) + `reason` (`insufficient` | `cross_tool` | `replayed`) + `suggested_action` — NOT the generic quota error. (A **no-proof** out-of-quota call keeps the existing `TierLimitReachedError` — not a new reject, only the message improves when a proof was presented.)
3. **replayed nonce** (`tryClaimPayment` fails on a seen nonce) → same downgrade path: no re-grant, no re-settle. **Claim the nonce BEFORE settle.**
4. **DB-error / empty-nonce** → default-deny the x402 UPGRADE (fall to free, no settle), fail-safe.
5. **correct exact/over-price proof for the called tool** → grant x402 → serve + settle (unchanged; FLOOR/over-pay preserved).
6. **Optional companion:** on a within-quota downgrade, set non-fatal `_algovault.x402_note: "proof_not_honored_fell_back_to_free"` (additive; update the success shape-snapshot if added).

Q2 CONFIRMED (no change): correct proof → serve+settle; free `get_trade_call` + free-tier quota access to ALL tools unchanged; FLOOR preserved.

**Net:** `resolveLicense(headers, {tool, timeframe})` binds the grant to the called tool via `verifyX402Payment(headers, tool)` + `paymentMatchesToolRoute`/`effectivePrice` + `tryClaimPayment` (claim-before-grant); invalid/insufficient/replayed/db-error → non-x402 tier, no settle, carry a `x402Downgrade.reason`. The `/mcp` handler parses `body.params.name`+`arguments.timeframe`, passes them in, and — when downgraded — peeks quota (read-only) → returns the `X402_PAYMENT_REQUIRED` envelope iff exhausted, else serves free. Settle only on a granted x402. HTTP path untouched. Proceeds with R1/R2/R3 + AC2c + the cross-tool/replay/out-of-quota-error unit tests + deployed markers + in-container replay probe.
