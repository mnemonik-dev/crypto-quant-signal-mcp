# Runbook — Virtuals ACP Untokenized Seller Onboarding (sandbox)

**Owner:** Mr.1 (manual steps at app.virtuals.io). **Wave:** P1-ACP-SELLER-SEED.
**Goal:** register AlgoVault as an untokenized **Seller** on the Virtuals Agent Commerce Protocol
(ACP), list the 3 launch offerings, and run the seller worker in the **Base Sepolia sandbox** to
graduate (10 successful jobs incl. 3 consecutive). No token, no mainnet, no real funds.

The code ships **stub-first + default-OFF**: nothing here blocks a deploy. Until you complete the
steps below and set `ACP_ENABLED=true` + the signer creds, the worker is a silent no-op.

---

## 0. Prereqs

- A wallet you control (MetaMask/Rabby) to connect at app.virtuals.io. This is **not** the
  X402_WALLET / facilitator wallet — ACP mints its own Virtuals-managed (Privy) agent wallet.
- Access to the Hetzner container env (where `X402_WALLET_ADDRESS` etc. already live).

---

## 1. Join ACP + create the Seller agent

1. Go to **https://app.virtuals.io/acp/join** and connect your wallet.
2. Create/register an **agent** (the seller). Choose the **untokenized / API** path — ACP supports
   untokenized agents; do **not** launch a token.
3. Set the agent profile: name (e.g. *AlgoVault*), description, category. Suggested description:
   > AlgoVault — the Brain Layer for AI trading agents. Composite perp trade verdicts
   > (direction + confidence + regime) across 5 venues, plus market scans and funding-rate arbitrage.
   > Read-only signals with an on-chain Merkle-verified track record.

---

## 2. Add the 3 launch offerings

On the agent's **Offerings** (Services) section, add each offering below **verbatim** (name +
description + requirement schema). These MUST match the code's `src/channels/acp/offerings.ts`
(the seller reads the offering name back via `session.job.description` to dispatch — a name
mismatch = an unservable job). Price is per call in USDC; SLA = 5 minutes.

### Offering 1 — `AlgoVault Trade Call`  ·  0.02 USDC  ·  SLA 5m
> Composite perp trade verdict (BUY / SELL / HOLD) with confidence score and market regime for a
> crypto asset, aggregated across 5 perp venues. Read-only; on-chain Merkle-verified track record.

Requirement schema (draft-07):
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["coin"],
  "properties": {
    "coin": { "type": "string", "minLength": 1, "maxLength": 20 },
    "timeframe": { "type": "string" },
    "exchange": { "type": "string" }
  }
}
```

### Offering 2 — `AlgoVault Market Scan`  ·  0.02 USDC  ·  SLA 5m
> Ranked multi-asset scan of actionable perp trade calls across the venue universe — verdict,
> confidence and regime per asset. Read-only.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "topN": { "type": "integer", "minimum": 1, "maximum": 50 },
    "timeframe": { "type": "string" },
    "exchange": { "type": "string" },
    "rankBy": { "type": "string" },
    "minConfidence": { "type": "number", "minimum": 0, "maximum": 100 },
    "includeHolds": { "type": "boolean" },
    "limit": { "type": "integer", "minimum": 1, "maximum": 50 }
  }
}
```

### Offering 3 — `AlgoVault Funding Arb`  ·  0.01 USDC  ·  SLA 5m
> Cross-venue perpetual funding-rate arbitrage scanner — ranked spread opportunities with urgency
> and conviction. Read-only.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "minSpreadBps": { "type": "number", "minimum": 0 },
    "limit": { "type": "integer", "minimum": 1, "maximum": 50 }
  }
}
```

> The deliverable is our public signal envelope returned off-chain via `session.submit(...)` —
> the exact shape the `/x402` + MCP channels return (never `outcome_return_pct`). USDC settlement on
> Base is revenue, not on-chain publication.

---

## 3. Mint the signer + copy creds

1. On the agent page open the **Signers** tab → **+ Add Signer** → **Copy Key**.
2. You now have three values:
   - **walletAddress** — the agent (smart) wallet address
   - **walletId** — the Privy wallet id
   - **signerPrivateKey** — the signer key (secret — treat like a private key)

---

## 4. Put the creds in the container env (never commit them)

Store the signer key like the other secrets (mode-600 file, e.g. alongside
`~/.config/algovault/admin.env`; **never inline in a committed file** — the CI secret-scan must
stay green). Add these to the **Hetzner container env** (the same mechanism that carries
`X402_WALLET_ADDRESS`):

```sh
ACP_ENABLED=true
ACP_ENV=testnet                       # Base Sepolia sandbox (default). Do NOT set 'mainnet' — that is a separate Mr.1-gated wave.
ACP_WALLET_ADDRESS=0x…                # from Signers → walletAddress
ACP_WALLET_ID=…                       # from Signers → walletId
ACP_SIGNER_PRIVATE_KEY=…              # from Signers → Copy Key (secret)
```

Recreate the container so it picks up the new env (`docker compose up -d <service>` — a plain
`restart` does NOT reload `env_file`). Verify:

```sh
docker exec <ctr> env | grep '^ACP_'          # ACP_ENABLED + creds present (redact the key when pasting)
docker logs <ctr> 2>&1 | grep -i 'ACP seller' # expect: "Virtuals ACP seller worker started (mode=live)"
```

If any signer cred is missing the worker runs the **[STUB] seller** (dark, no settlement) — safe,
but no real jobs. If all three are present it runs **live** on the sandbox.

---

## 5. Fund the sandbox wallet (Base Sepolia)

The agent wallet needs Base Sepolia ETH for gas (and test USDC to self-test as a buyer during
graduation). Use a Base Sepolia faucet (e.g. the Coinbase Developer Platform / Alchemy Base Sepolia
faucet) to fund `ACP_WALLET_ADDRESS`. Testnet only — no real funds.

---

## 6. Local sandbox dry-run (optional, no creds needed)

To watch the full lifecycle offline before going live:

```sh
ACP_ENABLED=true node dist/channels/acp/seller-worker.js
```

Expected: `[STUB] seller` → `setBudget $0.02` → a real deliverable → `delivered get_trade_call` →
`completed`. (Runs the real signal tool against live exchange data; no chain interaction.)

---

## 7. Graduation checklist (`P1-ACP-SANDBOX-GRADUATION`)

Graduation is a **manual** Virtuals review, not a code gate. Target: **10 successful sandbox jobs,
including 3 consecutive**, then submit the Graduate-Agent form.

- [ ] Worker shows `mode=live` in the container logs.
- [ ] Wallet funded on Base Sepolia (gas + a little test USDC).
- [ ] Drive jobs against each of the 3 offerings via your own test-buyer (an ACP buyer agent that
      calls `createJobByOfferingName(chainId, "AlgoVault Trade Call", <sellerAddress>, { coin: "BTC" })`,
      funds it, and confirms the deliverable). See the acp-node-v2 buyer example.
- [ ] Reach **10 successful jobs**, with **3 consecutive** successes (no rejects/expiries in the run).
- [ ] Submit the **Graduate Agent** form on the agent page.
- [ ] On approval, the agent becomes discoverable to ACP buyers on the sandbox; a later wave decides
      the mainnet flip (`ACP_ENV=mainnet` + revisit whether the 0.01–0.02 USDC price clears ACP
      protocol fee + gas). **Do not flip to mainnet from this wave.**

Report progress in `status.md` under the `P1-ACP-SANDBOX-GRADUATION` follow-up.

---

## Rollback

Set `ACP_ENABLED=false` (or unset it) and recreate the container → the worker never starts → prod
is byte-identical. Instant, no redeploy required beyond the env change.
