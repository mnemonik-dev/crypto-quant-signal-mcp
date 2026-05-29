# X402-CDP-BAZAAR-DISCOVERY-W1 — MANUAL PENDING (Mr.1 / Cowork)

_Lazy-loaded (`*-PENDING.md`). Two blockers: CDP API key + funded Base Sepolia payer. Dark code ships without them (stub-first)._

---

## 1. Mint the CDP API Key (maps to the "Create API key" screenshot)

**What this is:** a CDP **Secret API Key** → gives `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`. It authenticates AlgoVault's server to the CDP x402 facilitator for verify/settle. It does **not** touch AlgoVault's own funds — each buyer's signed ERC-3009 authorization moves their USDC, and CDP pays the gas. So a **minimal, View-only key** is all that's needed.

| Field in the dialog | What to do | Why |
|---|---|---|
| **API key nickname** | `algovault-x402-cdp-facilitator` | Greppable revocation handle (mint convention `<project>-<purpose>-<scope>`). |
| **Global → IP allowlist** | **Leave BLANK** | Sepolia proof may run from a different IP than prod; an allowlist mismatch fails silently. Secret is the control. *(Optional later: add `204.168.185.24` — but per the dialog's note, if the VPS egresses over IPv6 you must use the IPv6 CIDR or it won't work. Only after confirming the outbound IP.)* |
| **Coinbase App & Advanced Trade → View (read-only)** | Leave checked (it's forced-on/greyed) | Default; this product isn't used by x402. |
| **… → Trade** | ☐ **UNCHECK** | x402 executes no trades on your Coinbase account. |
| **… → Transfer** | ☐ **UNCHECK** | x402 initiates no transfers of your funds. |
| **… → Receive** | ☐ **UNCHECK** | Not needed. |
| **Server Wallet → Accounts → Export (export private key)** | ☐ **UNCHECK** | Never enable — dangerous, unused. |
| **Server Wallet → Policies → Manage** | ☐ **UNCHECK** | Unused. |
| **Advanced Settings → Signature algorithm** | **● Ed25519 (Recommended)** | `@coinbase/cdp-sdk`'s `generateJwt` supports it; single-line base64 secret (clean in `.env`). **Avoid ECDSA** — multi-line PEM is error-prone in `.env` and is only "required for Coinbase App & Advanced Trade SDKs," which we don't use. |

→ **Net: tick nothing extra.** Then **Create**. Copy the **one-time** values:
- `CDP_API_KEY_ID` = the key id (UUID).
- `CDP_API_KEY_SECRET` = the Ed25519 secret (base64, single line).

**Hand-off (do NOT paste secrets in chat):** drop both into one onetimesecret.com one-view link, or append them yourself to `/opt/crypto-quant-signal-mcp/.env`. The flip step is `H1` in `x402-cdp-bazaar-discovery-w1-endpoint-truth.md`.

**Honest caveat:** if a Sepolia settle later returns `403 / PERMISSION_DENIED` *from CDP* (not from the chain), the fix is enabling the one relevant scope — but CDP's x402 quickstart documents a plain Secret API Key as sufficient, so the minimal key above should settle fine.

---

## 2. Questions for Cowork (copy-paste)

> **X402-CDP-BAZAAR-DISCOVERY-W1 — Plan-Mode Step 0 findings + questions.** Code ran read-only probes only. **0 fictional primitives** (every SDK/endpoint exists). But 3 spec facts were wrong and 2 hard blockers exist. Decisions were delegated to Code (shipping dark behind flags now); the below are confirm-FYI + provisioning asks.

**Q1 — Facilitator premise.** Spec says prod settles through the public `x402.org/facilitator`. It does **not**: prod runs a **self-hosted facilitator sidecar** (`crypto-quant-signal-mcp-facilitator-1`, `http://facilitator:4022`, gas wallet `0x804B`). The fix is unchanged (route through CDP to earn the listing); the adapter's default branch preserves the sidecar byte-identical. OK to treat the `x402org` flag value as a "legacy = current sidecar" alias? Any reason public x402.org was assumed?

**Q2 — Which tools are paid?** Spec R3 lists `get_trade_call` + `get_trade_signal` as the 402-gated routes. Reality: `TOOL_PRICING` gates **`get_trade_signal`, `scan_funding_arb`, `get_market_regime`** — **`get_trade_call` is FREE** (not in `TOOL_PRICING`). Code is declaring Bazaar discovery for the 3 actually-paid tools. Confirm that's the intended set, or do you want `get_trade_call` to *become* paid (separate behavior-change wave)?

**Q3 — CDP API key (BLOCKER).** CDP keys are absent on the server. Need a **CDP Secret API Key** (Ed25519, View-only) → `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`. Who mints it? (Step-by-step above.) Until then the wave ships dark / stub-first.

**Q4 — Base Sepolia proof (BLOCKER).** The Sepolia-before-mainnet settle gate needs a **funded Base Sepolia payer wallet** with test USDC (the buyer side that signs the payment). CDP pays gas, but the payer still needs test USDC. Provide a funded Sepolia key, or should Code use a throwaway wallet + a Base Sepolia USDC faucet?

**Q5 — Gas/cost model change (confirm).** Switching settle from the self-hosted facilitator (AlgoVault gas wallet `0x804B` pays gas) to CDP means **Coinbase sponsors gas** ("facilitator-pays-gas") — lower AlgoVault gas spend, new dependency on CDP availability. Two-flag firewall flips back instantly. OK to proceed once Sepolia is green?

**Q6 — payTo confirm.** Listing + canary use mainnet payTo `0x778A05280Fd8dB980E920fE9f31d0A8eAbD17d59` (Rabby), same address on Sepolia. Confirm correct.

> _FYI corrections folded in (no action): CDP env vars are exactly `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`; secrets live in host `.env`, not GH-Actions secrets; `generate402Response` is dead code so indexing hooks the settle path; `@x402/core@2.9.0` already supports the extension API (no core bump)._
