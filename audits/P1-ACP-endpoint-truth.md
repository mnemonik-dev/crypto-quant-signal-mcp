# P1-ACP-SELLER-SEED — Endpoint-Truth (Plan-Mode probe)

**Wave:** P1 — List AlgoVault as an untokenized Seller on Virtuals ACP (sandbox-first).
**Date:** 2026-07-03. **Base:** `~/code/crypto-quant-signal-mcp` @ `origin/main` `395aa81` (v1.22.1).
**Worktree:** `~/code/cqsm-wt-acp-seller` (branch `feat/virtuals-acp-seller-seed-w1`, off origin/main).
**SDK probed:** `@virtuals-protocol/acp-node-v2@0.1.7` (`npm pack` tarball, extracted + grepped).
**Verdict:** 0 blocking fictional primitives (2 minor drifts corrected inline). PROCEED (Cowork ratified 11/11 + 6 deltas).

## 1. SDK version + deprecation

| claim | probe | reality |
|---|---|---|
| acp-node-v2 latest 0.1.7 (2026-07-02) | `npm view @virtuals-protocol/acp-node-v2 version time` | ✅ 0.1.7, published 2026-07-02T00:09Z; not deprecated |
| v1 `acp-node` deprecated/archived | `npm view @virtuals-protocol/acp-node deprecated` | ✅ "Deprecated. Use @virtuals-protocol/acp-node-v2 instead" (v1 latest 0.3.0-beta.40) |

→ pin **exact `0.1.7`**; adapter-wrap in `src/channels/acp/provider.ts` (v0.x <1wk old → expect churn).

## 2. Sandbox / testnet (the wave-premise risk — RESOLVED GREEN)

`dist/core/constants.js` / `constants.d.ts`:
- `import { base, baseSepolia, bscTestnet } from "viem/chains"` — Base Sepolia (chainId **84532**) is a first-class chain.
- `USDC_ADDRESSES`, `USDC_DECIMALS` (`[baseSepolia.id]: 6`), `ACP_CONTRACT_ADDRESSES` etc. all carry a baseSepolia entry.
- `ACP_SERVER_URL = "https://api.acp.virtuals.io"` (mainnet) · `ACP_TESTNET_SERVER_URL = "https://api-dev.acp.virtuals.io"` (testnet).
- `PRIVY_APP_ID` (mainnet) · `TESTNET_PRIVY_APP_ID = "clsakj3e205soyepnl23x2itv"` (testnet).
- `SUPPORTED_CHAINS` includes `{ id: 84532, name: "Base Sepolia" }` and `{ id: 8453, name: "Base" }`.

→ sandbox selected via the Privy adapter's `serverUrl` + `privyAppId` + `chains:[baseSepolia]` (+ `AcpApiClient`/`SseTransport({serverUrl})`). NOTE: the README's summarized example only showed `base`; the **tarball source is authoritative** — baseSepolia is fully supported (prompt-factuality-preflight: verify source over summary).

## 3. Seller API surface (verbatim from `dist/*.d.ts`)

| primitive | source | status |
|---|---|---|
| `AcpAgent.create(input: CreateAcpClientInput & {transport?, api?})` | `acpAgent.d.ts` | ✅ `{provider}` required; transport/api optional |
| `agent.on("entry", (session: JobSession, entry: JobRoomEntry) => void\|Promise)` · `agent.start(onConnected?, streams?)` · `agent.stop()` · `agent.sessions` | `acpAgent.d.ts` | ✅ exact |
| `session.status ∈ open\|budget_set\|funded\|submitted\|completed\|rejected\|expired` | `jobSession.d.ts:6` | ✅ |
| `session.setBudget(amount: AssetToken): Promise<void>` | `jobSession.d.ts` | ✅ |
| `session.submit(deliverable: string, transferAmount?: AssetToken): Promise<void>` | `jobSession.d.ts` | ✅ deliverable is a STRING; no transferAmount (no fund-forwarding) |
| `session.job?.description` = offering name · `session.chainId` · `session.jobId` · `session.roles: AgentRole[]` | `jobSession.d.ts` / README L164 | ✅ dispatch key |
| `AssetToken.usdc(amount: number, chainId: number): AssetToken` · `.amount` · `.usdcFromRaw(bigint, chainId)` | `core/assetToken.d.ts` | ✅ exact |
| `AgentRole = "client" \| "provider" \| "evaluator"` | `events/types.d.ts:85` | ✅ we filter `provider` |
| `JobRoomEntry = SystemEntry \| AgentMessage`; `AgentMessage.contentType ∈ text\|proposal\|deliverable\|structured\|requirement`; `SystemEntry.event.type ∈ job.created\|budget.set\|job.funded\|job.submitted\|job.completed\|job.rejected\|job.expired` | `events/types.d.ts` | ✅ requirement→setBudget, funded→submit |
| `AcpAgentOffering {name, description, requirements, deliverable, slaMinutes, priceType, priceValue, requiredFunds, isHidden, isPrivate}` | `events/types.d.ts:168` | ✅ R4 offering shape |
| `MIN_SLA_MINS = 5` | `constants.d.ts` | ✅ slaMinutes=5 (floor) |

README seller example (L130-166) matches the prompt's lifecycle byte-for-byte: `requirement` msg while `open` → `setBudget(AssetToken.usdc(price, session.chainId))`; `job.funded` → `submit(...)`; `job.completed` → log.

## 4. Corrections (prompt text vs live SDK) — both resolved inline

| # | prompt | live reality | resolution (Cowork-ratified) |
|---|---|---|---|
| C1 | Provider `AlchemyEvmProviderAdapter` (local privkey) | **absent** in 0.1.7; exports are `ViemProviderAdapter` (local) + `PrivyAlchemyEvmProviderAdapter` (Privy) + Solana variants | **Q4: use `PrivyAlchemyEvmProviderAdapter.create({walletAddress, walletId, signerPrivateKey, chains, serverUrl, privyAppId, builderCode?})`** — the Signers-tab creds map 1:1 |
| C2 | reuse tool `run(params, license)` | **no uniform `run()`** — exports are `getTradeSignal`/`routeTradeCall` (`get-trade-call.ts`/`trade-call-router.ts`), `runScanTradeCall` (`scan-trade-calls.ts:156`), `scanFundingArb` (`scan-funding-arb.ts:179`) | **Q2: reuse `callCoreHandler(tool: HttpTool, input, license)` @ `src/lib/x402-http-routes.ts:113`** (the a2mcp cross-channel seam; returns the public envelope) |

## 5. Reuse seams (verified on origin/main)

- **Template:** `src/lib/okx-a2mcp.ts` (sibling agent-commerce channel) — `env→resolveConfig→pure select()→construct`, two-flag firewall (`OKX_AI_ENABLED` outer + `channels.a2mcp` inner), Stub-first, boot-safe mount (crash-loop lesson 2026-07-01).
- **Dispatch:** `callCoreHandler(ht, input, {tier:'x402', key:null})` @ `x402-http-routes.ts:113`; `HTTP_TOOLS = ['get_trade_signal','scan_funding_arb','get_market_regime','scan_trade_calls','get_equity_call','get_equity_regime']` @ :105. Mapping `get_trade_call → get_trade_signal` (alias-keyed; `get_trade_call` deliberately non-discoverable, kept out of HTTP_TOOLS — CH3).
- **Registry:** `src/lib/feature-registry.ts` — `FeatureSpec.channels {mcp,httpX402,bot,webhook,a2mcp}` @ :66; `PublicCapability.channels` @ :222; `projectCapabilities()` spreads `f.channels` @ :244. Price: `getFeature(tool)?.x402?.basePriceUsd` (get_trade_call 0.02 :111, scan_trade_calls 0.02 :149, scan_funding_arb 0.01 :133).

## 6. Data-Integrity firewall (LAW) — verification

- `OnChainJob` (`core/operations.d.ts`) fields = `{id, client, provider, evaluator, description, budget, expiredAt, status, hook}` — **NO deliverable field**. `AcpJob.deliverable` is populated from the OFF-CHAIN job API (`acpJob.js:47/75`, `data.deliverable`). Strong evidence the deliverable is off-chain; on-chain `submit` (`ACP_SELECTORS.submit`) is a state transition/escrow op.
- **Build-time gate (Q6, persistent canary):** read `dist/core/operations.js` submit encoder — if the deliverable STRING is embedded in on-chain CALLDATA (vs sent to the off-chain job API), **HALT + escalate** (no signal data on-chain). Assert USDC escrow settlement is the ONLY on-chain write in the ACP paths. Re-fires on every build / SDK bump.
- Deliverable exposes the **public envelope only** via `callCoreHandler` (the x402 public path) — `outcome_return_pct` never present. R8 asserts this.

## 7. Deploy / process (R6)

- Dockerfile: single `CMD ["node", "dist/index.js"]`; **no process manager** (no pm2); a2mcp mounts in-process (`index.ts:3093`). TG bot is a SEPARATE repo/systemd.
- **Q1:** in-process boot-safe worker started from `index.ts` when `ACP_ENABLED=true` (mirrors `mountOkxA2mcpRoutes`) + `src/channels/acp/seller-worker.ts` standalone (`node dist/channels/acp/seller-worker.js`) for the sandbox dry-run. `tsc` emits `dist/channels/acp/*` (no Dockerfile change). Horizontal-scale singleton caveat → system-map note + WIS.
- `deploy.yml` `paths-ignore` = {activation-funnel/snapshots, ops/systemd, ops/monitoring, LICENSE, glama.json} — narrow; any `src/` push redeploys (CLAUDE.md "paths-ignore covers *.md/docs" claim is STALE).

## 8. Deps (R1)

acp-node-v2@0.1.7 deps: `@account-kit/infra ^4.84.1`, `@alchemy/wallet-apis 5.0.0-beta.9`, `@privy-io/node ^0.16.0`, `@solana/kit 5.1.0`, `ajv ^8.18.0`, `ajv-formats ^3.0.1`, `eventsource ^4.1.0`, `ox ^0.14.17`, `socket.io-client ^4.8.3`, `viem ^2.47.0`. Peer deps: none declared (README notes viem + @account-kit/infra). **If install/build breaks → HALT + report** (do not force).

## 9. Test runner

vitest (`npm test` = `vitest run`); tests at `tests/unit/*.test.ts`. New tests wire in here (node:test `.test.mjs` files are excluded in `vitest.config.ts` — do NOT author ACP tests as `.test.mjs`).
