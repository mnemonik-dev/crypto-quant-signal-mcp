# endpoint-truth.md — X402-CDP-BAZAAR-DISCOVERY-W1

**Wave:** X402-CDP-BAZAAR-DISCOVERY-W1
**Target ICP:** T3 (+ tier-agnostic autonomous agents discovering paid services via x402)
**Plan-Mode probe date (UTC):** 2026-05-29
**Status:** 🟡 AWAITING ARCHITECT APPROVAL — zero state mutation performed. All probes below are read-only (npm view, tarball grep, HTTPS GET, `docker exec printenv` grep [public values + key-names-only], `git fetch`, `gh secret list`).
**Repo:** `AlgoVaultLabs/crypto-quant-signal-mcp` @ `e1de368` (local `/Users/tank/crypto-quant-signal-mcp` == origin/main, 0 ahead / 0 behind; clean tracked baseline — only untracked stale audit artifacts present)
**Fictional build primitives found:** 0 (all spec primitives physically exist). **Premise/identifier corrections:** 6 (fold-in, see §F). Below the ≥3-fictional HALT threshold → fix-inline-and-flag, with one premise correction (self-hosted facilitator) flagged for explicit architect ratification before any flip.

---

## A. Wave Objective (restatement)

Make AlgoVault's **paid x402 MCP tool routes** discoverable in **Coinbase's CDP x402 Bazaar** (the official discovery catalog + the human-browsable Agentic.Market surface) so autonomous agents shopping the Bazaar can find, evaluate, and pay AlgoVault with zero human in the loop. Bazaar listing is **earned, not registered**: the CDP Facilitator catalogs a route the first time a real **settle** completes through it, with the route carrying accepted Bazaar discovery-extension metadata. Achieve this **without breaking live x402 revenue**: ship a config-driven `FacilitatorAdapter` behind a two-flag firewall (outer `X402_FACILITATOR`, inner `BAZAAR_DISCOVERABLE`), stub-first when CDP keys are absent, proven on **Base Sepolia before any mainnet flip**. Generator-level: facilitator target + discovery declaration become config, retiring "which facilitator / which discovery layer" as a recurring code change (future Circle dual-list, new networks inherit free). Strengthens Moat 6 (platform ecosystem) + Moat 3 (data flywheel).

---

## B. system-map edge-touch enumeration (Step 0)

| Edge | Type | Touch |
|---|---|---|
| `mcp-server → facilitator(self-hosted sidecar :4022) → Base mainnet` | EXISTING producer→settle edge | Adapter-wrapped; **unchanged** on default/legacy path |
| `mcp-server → CDP Facilitator (api.cdp.coinbase.com/platform/v2/x402) → Base` | **NEW** publish/settle target edge | Added behind `X402_FACILITATOR=cdp` |
| `paid MCP tool routes → CDP x402 Bazaar / Agentic.Market catalog` | **NEW** external publish-target edge | Earned via settle-through-CDP + `declareDiscoveryExtension` |
| `bazaar-listing canary (Hetzner cron) → CDP merchant-discovery endpoint → send_telegram.sh` | **NEW** monitoring edge | Weekly off-`:00`, severity-gated, fail-open |
| `FacilitatorAdapter` (new internal seam in `src/lib/x402*`) | NEW internal component | Encapsulates facilitator target + discovery declaration |

→ **system-map.md updated: Y** required at completion (2 new producer/consumer edges + 1 external publish target + 1 monitoring edge + 1 new component card).

---

## C. Endpoint-truth table (claim | reality | resolution)

| # | Claim (spec) | Reality (probe) | Resolution |
|---|---|---|---|
| 1 | x402 facilitator config at `src/lib/x402.ts:222-240` | `:222-240` is `settleX402Async` (settle), **not** facilitator config. Facilitator client constructed at `x402.ts:87-94` (`new HTTPFacilitatorClient`); facilitator URL/network/payTo config at `x402.ts:22-31`; `buildPaymentRequirements` at `x402.ts:143-153`. | **Cite repaired.** Adapter wraps `x402.ts:87-94` (client) + `:143-153` (requirements). |
| 2 | Production settles via **public `x402.org/facilitator`** | **FALSE.** Live container env: `X402_FACILITATOR_URL=http://facilitator:4022`; a **self-hosted facilitator sidecar** `crypto-quant-signal-mcp-facilitator-1` (built from `src/facilitator.ts`, `@x402/evm`, gas wallet `FACILITATOR_PRIVATE_KEY=0x804B…`) does verify/settle directly on-chain. | **Premise corrected** (§F-1). Conclusion **unchanged**: current facilitator ≠ CDP → AlgoVault not in Bazaar. Adapter's legacy path = "use `X402_FACILITATOR_URL` exactly as today" (preserves the sidecar). **Architect ratification requested** before any flip. |
| 3 | Current x402 pkg / v2 bazaar-extension pkg exist | `@x402/core@2.9.0` installed (latest 2.13.0; same major, not >6mo stale). `@x402/evm@2.9.0` installed. **`@x402/extensions`** exists on npm (2.9.0→2.13.0); subpath `@x402/extensions/bazaar` real; exports **`bazaarResourceServerExtension`, `declareDiscoveryExtension`, `withBazaar`, `bazaarExtension`** (tarball-grep confirmed). **`@coinbase/x402@2.1.0`** real; exports `createFacilitatorConfig`, `createCdpAuthHeaders`, `createAuthHeaders`. | **Add deps** `@x402/extensions@^2.9.0` + `@coinbase/x402@^2.1.0` (pin to match installed core major). No core bump required. |
| 4 | Installed core supports the extension flow | `mechanisms-*.d.ts`: `x402ResourceServer.registerExtension(ResourceServerExtension)`, `getExtensions()`, `enrichDeclaration`, `createPaymentRequiredResponse(…, extensions?)`; `ResourceConfig.extensions?: Record<string,unknown>`; `HTTPFacilitatorClient(config?: { url?, createAuthHeaders? })`. | **Feasible on 2.9.0.** Register `bazaarResourceServerExtension`; pass `extensions: declareDiscoveryExtension({…})` into each tool's `buildPaymentRequirements`; CDP auth via `createAuthHeaders` seam. |
| 5 | CDP facilitator base `https://api.cdp.coinbase.com/platform/v2/x402` | `curl` → **401** (auth-gated; exists). | Real. Requires `CDP_API_KEY_ID`+`CDP_API_KEY_SECRET` Bearer (via `@coinbase/x402`). Acceptable per probe set. |
| 6 | CDP discovery `…/discovery/{resources,search,merchant}` | `resources` → **200** (100 items, keys: `accepts/description/extensions/quality/type/resource/lastUpdated/x402Version`); `search?query=…` → **200**; `merchant?payTo=0x778A…` → **200** `{pagination.total:0, resources:[]}`. | Real. `quality` field confirms metadata-quality ranking. **AlgoVault absent (total:0)** = correct pre-listing baseline. Canary endpoint shape validated. |
| 7 | x402.org catalog is **separate** from CDP Bazaar | `https://x402.org/facilitator/discovery/resources` → 308 → `www.x402.org/...` → **404** (no Bazaar catalog). `…/supported` → **200** (works as a facilitator). | Confirmed separate. x402.org-family facilitators (incl. the self-hosted sidecar) do **not** feed the CDP catalog. |
| 8 | CDP API keys present on resource server | Live container `printenv` → **no `CDP_*` vars**. `gh secret list` → only `VPS_HOST`, `VPS_SSH_KEY` (no CDP/X402 secrets). | **MANUAL_PENDING: Mr.1 mint CDP API key** (portal.cdp.coinbase.com). Stub-first path applies; wave ships dark regardless. |
| 9 | ⚠️ Mainnet vs testnet (revenue integrity) | Live container env `X402_NETWORK=base-mainnet` → `CAIP2['base-mainnet']='eip155:8453'` (deterministic, `x402.ts:28,31`). Live `tools/call get_trade_signal` (no payment) → **HTTP 200** (free-tier/HOLD path; no 402 emitted — see #11). | ✅ **Production on Base mainnet `eip155:8453`** — real USDC, NOT Sepolia. **No revenue-integrity HALT.** (Live-402 challenge not emitted on free path; mainnet confirmed via env+code.) |
| 10 | Paid routes = `get_trade_call` / `get_trade_signal` | `TOOL_PRICING` (`x402.ts:40-44`) = **`get_trade_signal` ($0.02), `scan_funding_arb` ($0.01), `get_market_regime` ($0.02)`**. **`get_trade_call` is NOT in `TOOL_PRICING`** (unpaid/free). | **Drift (§F-3).** Discoverable set = the **3 paid tools**. `get_trade_call` excluded (not 402-gated). Flagged for architect: include only if it is first added to `TOOL_PRICING` (out of this wave's scope; would be a behavior change). |
| 11 | 402 response carries the discovery metadata | `generate402Response` (`x402.ts:247`) is **dead code** (zero call sites). Model is optimistic: `resolveLicense` (`license.ts:119`) verifies attached `x-payment` → serves → `settleX402Async` (`index.ts:2023`) settles post-response; no payment → free tier (200). | **Hook the requirements→verify→settle path**, not the dead 402 generator. Attach extension in `buildPaymentRequirements`; indexing is earned at **settle**. Optionally mirror extension into `generate402Response` for consistency. |
| 12 | Deploy ships `src/` into image; env via secrets | GHA → SSH → `git reset --hard origin/main` → `docker compose up -d --build --force-recreate` (**image builds on Hetzner**; `src/` ships automatically). Env via `env_file: .env` at `/opt/crypto-quant-signal-mcp/.env`. Compose **hardcodes** `X402_FACILITATOR_URL`+`X402_NETWORK` in inline `environment:` (overrides `.env`); new flags `X402_FACILITATOR`/`BAZAAR_DISCOVERABLE`/`CDP_*` are **not** in that block → flow via `.env`. | New flags + CDP keys → append to host `.env` (idempotent grep-guard), `docker compose up -d --force-recreate mcp-server`. **No compose edit needed for the flag** (adapter ignores `X402_FACILITATOR_URL` on the `cdp` path). |
| 13 | Canary script lives outside `src/` → Dockerfile/deploy wiring | Confirmed pattern (e.g. `scripts/funnel-by-channel.mjs` + Dockerfile Stage-2 COPY). `deploy.yml paths-ignore` = only `activation-funnel/snapshots/**`, `activation-funnel/README.md`, `ops/systemd/**` (does **not** ignore `audits/**`/`*.md`). | Canary as Hetzner cron (host-side), off-`:00`, via `send_telegram.sh`. If a script must ship in-image, add Dockerfile COPY; host-side cron preferred (no image dependency). |

---

## D. Identifier diff (R-section vs AC-section vs LIVE)

| Identifier | R-section (spec) | AC-section (spec) | LIVE / canonical | Verdict |
|---|---|---|---|---|
| CDP facilitator URL | `https://api.cdp.coinbase.com/platform/v2/x402` (R2) | `…/v2/x402/discovery/{resources,search,merchant}` (AC) | base 401; discovery 200 | ✅ consistent, real |
| payTo / sellerAddress | "probe from `src/lib/x402.ts`/env" (R, Context) | `payTo=<mainnet payTo>` / `<sepolia payTo>` (AC) | `X402_WALLET_ADDRESS=0x778A05280Fd8dB980E920fE9f31d0A8eAbD17d59` (Rabby, receives USDC) | ✅ consistent. Same address valid on Sepolia (EVM address chain-agnostic). **Do NOT change** `X402_WALLET_ADDRESS` (per standing rule). |
| CDP key var names | generic `CDP_API_KEY_*` (R2, R6) | `CDP_API_KEY` in `docker exec … grep CDP_API_KEY` (AC/R6) | **exact: `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`** (`@coinbase/x402` tarball) | ⚠️ **Corrected** (§F-2). Probe `grep -E 'CDP_API_KEY_(ID\|SECRET)'`. |
| network id | mainnet `eip155:8453` (Context) | mainnet `eip155:8453` / sepolia `eip155:84532` (AC) | mainnet `eip155:8453` (live env); sepolia `eip155:84532` (code map) | ✅ consistent, real |
| facilitator (current) | "public `x402.org/facilitator`" (Objective/Context) | n/a | **self-hosted sidecar `http://facilitator:4022`** | 🛑 **Premise mismatch** (§F-1) — conclusion unchanged; ratification requested |
| paid tool set | `get_trade_call` / `get_trade_signal` (R3) | "AlgoVault's … route(s)" (AC) | `get_trade_signal`, `scan_funding_arb`, `get_market_regime` (`TOOL_PRICING`) | ⚠️ **Drift** (§F-3) — `get_trade_call` unpaid; cover the 3 paid tools |
| secret transport | `gh secret set … --repo …` (R6) | `docker exec … env \| grep CDP_API_KEY` (AC) | x402/CDP config lives in **host `.env`**, NOT GH-Actions secrets (only `VPS_*` are GH secrets) | ⚠️ **Corrected** (§F-5) — host `.env` append is canonical; GH-secret path N/A |

---

## E. Mainnet/testnet finding (Context ⚠️ — resolved)

✅ **Production confirmed on Base mainnet `eip155:8453`** (real USDC). Evidence: live container `X402_NETWORK=base-mainnet`; deterministic code map `x402.ts:28,31` → `eip155:8453`; self-hosted facilitator settles on Base mainnet via gas wallet `0x804B`. **No HALT.** (The live `tools/call` returned 200 on the free/HOLD path because no `x-payment` header was attached and `generate402Response` is unused — consistent with the spec's "free HOLDs return 200" note; the mainnet fact is established by env+code, not the 402 challenge.)

---

## F. Premise / identifier corrections (fold-in)

1. **🛑→ratify: self-hosted facilitator, not public x402.org.** Production verify/settle runs through the self-hosted sidecar (`http://facilitator:4022`, `src/facilitator.ts`, gas wallet `0x804B`). The wave's *fix* is unchanged (route through CDP to earn the listing), but the adapter's legacy/default branch must preserve **the sidecar**, not x402.org. The outer flag value `x402org` is therefore a **legacy alias** meaning "use `X402_FACILITATOR_URL` as-is (= sidecar in prod)". **Request architect ratification** of this premise correction before any flip; default branch ships byte-identical to today.
2. **CDP env vars** are exactly `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` (not generic `CDP_API_KEY_*`). `@coinbase/x402.createFacilitatorConfig()` reads these.
3. **Paid/discoverable tool set** = `get_trade_signal`, `scan_funding_arb`, `get_market_regime` (the 3 in `TOOL_PRICING`). `get_trade_call` is **not** 402-gated → excluded. Adding it would require adding it to `TOOL_PRICING` first (behavior change, out of scope).
4. **`generate402Response` is dead code** → Bazaar metadata hooks the `buildPaymentRequirements`→`verify`→`settle` path; indexing is earned at settle.
5. **Secret transport** = host `/opt/crypto-quant-signal-mcp/.env` append (idempotent grep-guard), not `gh secret set` (x402/CDP config is not a GH-Actions secret in this repo).
6. **Line cite** `:222-240` repaired → client at `x402.ts:87-94`, config at `:22-31`, requirements at `:143-153`.

---

## G. Ambiguous / blocking dependencies

- **[BLOCKER — Mr.1] CDP API key.** No `CDP_*` on container or in GH secrets. R4 (Sepolia settle) + mainnet flip cannot complete until `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` are minted (portal.cdp.coinbase.com) and appended to host `.env`. **Dark code (R1,R2,R3,R5,R6-scaffold,R7,R8) ships regardless via stub-first.**
- **[BLOCKER — Sepolia payer] funded Base Sepolia wallet w/ test USDC.** A real settle (R4) requires a payer signing an ERC-3009 `transferWithAuthorization` of Sepolia USDC (`0x036CbD…`) → payTo. Need a funded Sepolia test wallet/key (faucet or Mr.1). CDP facilitator pays gas; the **payer still needs test USDC**. payTo on Sepolia = same `0x778A…` (chain-agnostic) or a disposable test address.
- **[RATIFY — architect] premise correction §F-1** (self-hosted facilitator) + **scope confirm §F-3** (3 paid tools; `get_trade_call` excluded).
- **[CONFIRM] `@coinbase/x402` ↔ `@x402/core` auth shim.** `@coinbase/x402` targets the Coinbase `x402`/`x402-express` ecosystem; its auth-header output is adapted to `@x402/core`'s `FacilitatorConfig.createAuthHeaders(path)` seam via a thin shim (bounded integration task, verified at wire-up — not a fictional primitive).

---

## H. Proposed exact bash (NO execution until approved)

### H1. Facilitator switch (host `.env`) — DARK first, then flip after Sepolia green
```bash
# (a) DARK deploy — CDP keys present but firewall OFF (zero behavior change).
#     Mr.1 supplies CDP_API_KEY_ID / CDP_API_KEY_SECRET (never echoed to transcript).
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 '
  ENV=/opt/crypto-quant-signal-mcp/.env
  for KV in "X402_FACILITATOR=x402org" "BAZAAR_DISCOVERABLE=false"; do
    KEY="${KV%%=*}"; grep -q "^${KEY}=" "$ENV" || { echo "$KV" >> "$ENV"; echo "appended $KV"; }
  done
  # CDP_API_KEY_ID / CDP_API_KEY_SECRET appended by Mr.1 via onetimesecret one-shot
  docker compose -f /opt/crypto-quant-signal-mcp/docker-compose.yml up -d --force-recreate mcp-server
  docker exec crypto-quant-signal-mcp-mcp-server-1 printenv | grep -oE "^(X402_FACILITATOR|BAZAAR_DISCOVERABLE|CDP_API_KEY_ID|CDP_API_KEY_SECRET)=" '

# (b) FLIP (only after Sepolia gate GREEN + architect ok): sed-flip the two flags, recreate.
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 '
  ENV=/opt/crypto-quant-signal-mcp/.env
  sed -i "s/^X402_FACILITATOR=.*/X402_FACILITATOR=cdp/;s/^BAZAAR_DISCOVERABLE=.*/BAZAAR_DISCOVERABLE=true/" "$ENV"
  docker compose -f /opt/crypto-quant-signal-mcp/docker-compose.yml up -d --force-recreate mcp-server
  docker logs --tail 20 crypto-quant-signal-mcp-mcp-server-1 | grep -i x402 '
```

### H2. Base Sepolia test-settle (R4 — needs CDP keys + funded Sepolia payer)
```bash
# Standalone proof script (NOT the prod server): construct CDP-targeted resource server on
# Sepolia, declare bazaar extension, run a real verify+settle with a funded Sepolia payer,
# assert EXTENSION-RESPONSES: processing, then confirm merchant-discovery lists the route.
CDP_API_KEY_ID=… CDP_API_KEY_SECRET=… X402_NETWORK=base-sepolia \
SEPOLIA_PAYER_KEY=0x… \
node scripts/x402-cdp-sepolia-settle-proof.mjs   # new artifact, run locally/Hetzner

# Verify listing (Sepolia payTo):
curl -fsS "https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0x778A05280Fd8dB980E920fE9f31d0A8eAbD17d59" | python3 -m json.tool
```

### H3. Mainnet listing verification (after flip; ~10 min cache)
```bash
PAYTO=0x778A05280Fd8dB980E920fE9f31d0A8eAbD17d59
curl -fsS "https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=$PAYTO" | python3 -m json.tool
curl -fsS "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources" | python3 -c "import sys,json;d=json.load(sys.stdin);print([i['resource'] for i in d['items'] if '778a05280' in json.dumps(i).lower()])"
curl -fsS "https://api.cdp.coinbase.com/platform/v2/x402/discovery/search?query=crypto%20trading%20signal%20BUY%20SELL%20HOLD" | python3 -c "import sys,json;d=json.load(sys.stdin);print('hits',len(d.get('items',[])))"
```

### H4. bazaar-listing canary (host-side cron, off-`:00`)
```bash
# /opt/algovault-monitoring/x402-bazaar-canary.sh — weekly, alerts via send_telegram.sh ONLY
# on sustained drop-out (absent ≥2 consecutive weeks). DRY_RUN smoke for PROBE_OK + WOULD_FIRE.
# Cron: off-:00 boundary, e.g. "17 13 * * 1" (Mon 13:17 UTC).
DRY_RUN_CANARY=1 /opt/algovault-monitoring/x402-bazaar-canary.sh   # smoke
```

### H5. GH secret set — **NOT APPLICABLE** (correction §F-5)
CDP keys live in host `.env`, not GH-Actions secrets. (If the architect still wants a GH mirror: `printf '%s' "$CDP_API_KEY_ID" | gh secret set CDP_API_KEY_ID --repo AlgoVaultLabs/crypto-quant-signal-mcp` — literal-`-` trap noted — but it is unused by the current deploy path.)

---

## I. Proposed execution order (post-approval)

1. **R1** `FacilitatorAdapter` (`src/lib/x402/facilitator-adapter.ts` or in-file) — two-flag firewall, stub-first fallback + `[STUB]` log; default branch byte-identical to today (legacy sidecar via `X402_FACILITATOR_URL`).
2. **R2** CDP wiring — `@x402/extensions@^2.9.0` + `@coinbase/x402@^2.1.0`; `cdp` branch builds `HTTPFacilitatorClient({url: CDP, createAuthHeaders})`; register `bazaarResourceServerExtension`.
3. **R3** `declareBazaarRoute()` helper + per-tool `declareDiscoveryExtension` (3 paid tools) attached to `buildPaymentRequirements`; outcome-framed PFE-only descriptions (Data-Integrity scrub: no `outcome_return_pct`/Phase-E/internal tokens).
4. **R7** vitest: factory default/cdp/stub/`BAZAAR_DISCOVERABLE=false`; extension input validates vs its declared JSON Schema; description-leak guard. Preserve baseline.
5. **R5** bazaar-listing canary (host cron) + DRY_RUN smoke (PROBE_OK + synthetic WOULD_FIRE).
6. **R6** deploy wiring — host `.env` flags (dark), Dockerfile COPY only if a script must ship in-image; post-deploy `printenv` verify.
7. **Ship DARK** (flags OFF, stub-first) → commit (per-file add + cached-diff audit) → push → GHA deploy → post-deploy byte-identical verify.
8. **R4 gate** (when CDP keys + Sepolia payer available): Sepolia settle → `EXTENSION-RESPONSES: processing` → merchant-discovery lists route → **only then** H1(b) mainnet flip → H3 verify → paste JSON in status.md.
9. **R8** note Circle dual-list feasibility (`X402-DUAL-DISCOVERY-W1`) — do not implement.
10. status.md (newest-first, `system-map.md updated: Y`) + system-map.md edges same commit + 3-5 WIS → `Claude files/WIS-PENDING.md`.

**Firewall invariant:** flags default OFF → existing self-hosted-facilitator path runs untouched (existing tests green, 402/response shape byte-identical). CDP path is reachable only with `X402_FACILITATOR=cdp` AND `BAZAAR_DISCOVERABLE=true` AND CDP keys present; otherwise stub-falls-back to legacy.
