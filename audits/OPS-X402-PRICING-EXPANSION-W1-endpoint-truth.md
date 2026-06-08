# OPS-X402-PRICING-EXPANSION-W1 — Plan-Mode Step-0 endpoint-truth (light)

**Probed:** 2026-06-09 · `crypto-quant-signal-mcp` @ origin/main (`bce4c05`, clean) + live `https://api.algovault.com/capabilities`.
**Verdict:** ✅ **0 fictional primitives.** Every spec-cited primitive exists + verified. **1 fix-inline** (callCoreHandler needs +3 dispatch cases — implied by R2 "wire the routes", not explicitly named) + **1 stale-comment correction** (the scan_trade_calls x402 comment I left in FEATURE-PARITY-CHANNELS-W1 proposes PER-UNIT; this wave is FLAT — must correct, Factuality). No architect-confirm Q's (prices operator-approved 2026-06-08; mechanism clean). Plan-Mode-required (live payment surface) → produce this doc + wait for architect go-ahead.

---

## Probe truth-table (`claim | reality | resolution`)

### Spec Step-0 probe 1 — paid-set + route + bazaar mechanism
| Claim | Reality | Resolution |
|---|---|---|
| HTTP_TOOLS / BAZAAR_ROUTES / isPricedTool / TOOL_PRICING are the mechanism | `HTTP_TOOLS = ['get_trade_signal','scan_funding_arb','get_market_regime']` (x402-http-routes.ts:101); routes mount by looping HTTP_TOOLS (`:163`); `isPricedTool = HTTP_TOOLS.includes(callTool)` (index.ts:2189); `TOOL_PRICING` derives from the registry via `Object.fromEntries` (x402.ts:73); `BAZAAR_ROUTES: Record<string,BazaarRouteSpec>` (x402-bazaar.ts:62). | R2 adds the 3 to HTTP_TOOLS (→ routes + MCP gate) + BAZAAR_ROUTES (→ discovery). Registry price auto-derives TOOL_PRICING/effectivePrice (W1). |

### Spec Step-0 probe 2 — FLAT not per-result (the central concern)
| Claim | Reality | Resolution |
|---|---|---|
| /x402/scan charges flat $0.02, not eligible_non_hold | **Structurally flat.** The route declares `send402(res, tool)` (price = `effectivePrice(tool)`) BEFORE running, and `effectivePrice` applies its 1m premium ONLY when `getFeature(toolName)?.name === 'get_trade_call'` (x402.ts:461) → the 3 new tools return base $0.02 for EVERY timeframe. The on-chain charge is the declared flat amount; `callCoreHandler` runs the tool AFTER. The free-rail `max(1,N)` lives in `runScanTradeCall`'s `trackCall`, which is a NO-OP for tier:'x402' ("x402/internal short-circuit to Infinity" scan-trade-calls.ts:89). | The x402 route CANNOT multiply by result count by construction. AC#2 (accepts.amount==20000 atomic flat) holds. |
| ⚠️ callCoreHandler dispatch | **GAP** — `callCoreHandler` (x402-http-routes.ts:109) is a `switch (tool)` handling ONLY the original 3 (`:118-140`), NO default → the 3 new tools would return `undefined`. | **R2 must add 3 cases:** `scan_trade_calls → runScanTradeCall({topN,timeframe,exchange,minConfidence,includeHolds,limit}, license)`; `get_equity_call → getEquityCall({symbol, license})`; `get_equity_regime → getEquityRegime({symbol, license})` — the SAME fns the MCP handlers call (index.ts:467/492/521 — parity). Imports: `runScanTradeCall` (../tools/scan-trade-calls.js), `getEquityCall`/`getEquityRegime` (./equities/equity-tool-formatters.js), `ScanExchangeId` (../lib/trade-call-scanner.js). |

### Spec Step-0 probe 3 — get_trade_call untouched
| Claim | Reality | Resolution |
|---|---|---|
| Adding 3 to HTTP_TOOLS doesn't alter get_trade_call/get_trade_signal gating | `isPricedTool` set BEFORE = {get_trade_signal, scan_funding_arb, get_market_regime}; AFTER = +{scan_trade_calls, get_equity_call, get_equity_regime}. `get_trade_call` (canonical) is NOT in HTTP_TOOLS (only the alias `get_trade_signal` is — W1 A2 free-tier) → still un-gated. | +3 NAMED only; `get_trade_call`/`get_trade_signal` gating byte-unchanged. R3 test asserts this. |

### Spec Step-0 probe 4 — shape-snapshot delta
| Claim | Reality | Resolution |
|---|---|---|
| Snapshot gains the 3 price keys (additive) | `audits/x402-shape-snapshot-2026-06-08.json` has priced_names(4)/prices/gated_http_tools(3)/bazaar_discoverable(3)/effectivePrice/premium_1m/registry_httpX402_canonical. **NO programmatic consumer** (no test/script/canary reads it — grep clean) → a standalone dated audit fixture. | Generate a fresh `audits/x402-shape-snapshot-2026-06-09.json` (additive: priced_names 4→7, gated 3→6, bazaar 3→6, +3 prices @ 0.02, premium_1m += 3 @ 0.02 (no premium → base)). Doc-only; nothing breaks. |

### Live state (pre-wave, confirmed)
`scan_trade_calls`/`get_equity_call`/`get_equity_regime` = `httpX402:false, x402:null` (matches spec premise). `tools/list`=9. The original 3 prices live (get_trade_call/signal $0.02, scan_funding_arb $0.01, get_market_regime $0.02).

---

## Exact edit plan

**R1 — registry** (`feature-registry.ts`): for the 3 entries (scan `:104-116`, equity-call `:117-125`, equity-regime `:126-134`): `channels.httpX402: false→true` + `x402: null → { basePriceUsd: 0.02 }`. **Correct the stale scan comment** (`:113` "proposed $0.02/unit → scan = $0.02 × non-HOLD") → flat-pricing note (x402 declares price before running; per-result is FREE-rail only).

**R2 — routes + bazaar** (`x402-http-routes.ts` + `x402-bazaar.ts`): HTTP_TOOLS += 3 (HttpTool type auto-widens); `callCoreHandler` += 3 cases (above); `BAZAAR_ROUTES` += 3 `BazaarRouteSpec` entries (`{toolName, description, inputSchema, example, output}`): scan = SCAN_TRADE_CALLS_SCHEMA shape (topN/timeframe/exchange[5-venue]/minConfidence/includeHolds/limit); equity-call = `{symbol: string maxLen 12, required}`; equity-regime = `{symbol: string maxLen 12, optional→SPY}`. NO forbidden Bazaar tokens (FORBIDDEN_BAZAAR_TOKENS) in descriptions.

**R3 — free-quota untouched + tests:** zero change to `runScanTradeCall`/equity free-metering. Tests: effectivePrice 3 == 0.02 + 3 existing byte-identical; HTTP_TOOLS/isPricedTool set = +3 named (get_trade_call NOT gated); callCoreHandler dispatches the 3; free-rail unchanged. Update/extend `tests/x402-registry-derive.test.ts` + add a focused expansion test.

**Snapshot + canary:** new dated shape-snapshot; canary `--check` (TOOL_PRICING==registry, HTTP_TOOLS==registry httpX402-priced) + `--live` must stay green WITH the 3 new prices (the canary derives from the registry, so the 3 join automatically — verify rc=0).

---

## system-map edge enumeration

No NEW edge TYPE: the x402 HTTP route surface (existing producer) WIDENS 3→6 routes; the MCP `isPricedTool` gate (existing) gains 3; TOOL_PRICING/effectivePrice/BAZAAR derive (existing W1 edges) pick up the 3 prices. The x402-verify→processed_x402_payments edge is unchanged in shape. → **system-map.md updated: likely N** (additive pricing/gating on existing x402 edges; value+route-set widening, no new producer/consumer edge). `tools/list`=9 unchanged.

## Risk / firewall
Touches the LIVE payment surface (real USDC) — but additive: the 3 go from free-only to ALSO-x402-payable (the free-100 rail is byte-unchanged; only an ADDITIVE flat-pay rail after exhaustion). `get_trade_call` exception preserved (never touched). Deploy `deploy-direct.sh` (GHA down) at close-out; live-verify all 5 AC.
