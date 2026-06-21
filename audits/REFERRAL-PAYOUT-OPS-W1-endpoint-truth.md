# REFERRAL-PAYOUT-OPS-W1 — Plan-Mode Step-0 endpoint-truth

Wave: REFERRAL-PAYOUT-OPS-W1 (Tier-2 Bulk-Spec, 3 chapters; payment-path / revenue-out).
Probed origin/main `17329ea` · built in worktree `feat/referral-payout-ops-w1`.

## Step-0 probe results (claim | reality | resolution)

| Spec primitive | Reality (probed) | Resolution |
|---|---|---|
| `@coinbase/cdp-sdk` for server wallets | v1.51.0 present but **transitive only** (NOT a direct dep) | C3 promotes it to `dependencies` (pinned 1.51.0) — a src/** import must be declared |
| "reuse the CDP API keys from x402 Bazaar" | host has `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` (x402 **facilitator** scope) — but cdp-sdk server-wallet **signing requires `CDP_WALLET_SECRET`**, which is **ABSENT** | 🛑 **C3 BLOCKER** → Mr.1 provisions `CDP_WALLET_SECRET` (CDP portal → host `.env`). Fallback ratified: ship C1+C2 live, C3 code built but the live send GATED (Stub) until the secret + a funded wallet exist |
| operator alert via `send_telegram.sh` | host `send_telegram.sh` is **CRITICAL-severity-gated** (would SUPPRESS a scheduled, non-emergency payout notice) | **Channel correction:** use the in-container `src/lib/telegram.ts sendDigest` (the operator-digest path used by geo-weekly-cron / chat-analytics-digest). No gate; reaches Mr.1 via `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (both present in the container) |
| EVM address checksum validation | `viem ^2.47.12` **already a direct dep** | C1 validates via viem `getAddress` — but viem is `strict:false` (re-checksums any well-formed hex), so the EIP-55 **typo-guard** (mixed-case must match its own checksum) lives in `normalizePayoutAddress`, NOT in `getAddress` |
| onchain CI blocklist (Data-Integrity LAW) | no literal blocklist canary in repo; the LAW's list is Python notarization libs (web3/eth-account/…) | cdp-sdk + viem are **payment-rail / revenue path** (like x402 USDC), NOT onchain-notarization → not blocklisted; revenue-out explicitly approved by Mr.1 2026-06-21 |
| `referral_codes` payout address field | NO address column today (`code/kind/owner_key/owner_email/owner_label/created_at`) | C1 adds `owner_payout_address` (migration 017 + idempotent `ensureReferralPayoutColumns`; PG `ADD COLUMN IF NOT EXISTS` / SQLite `PRAGMA` pre-check) |
| `pendingPayouts(minUsd)` / `markLedger` / `getLedgerById` | present (referral-store.ts) — grouped ≥-min queue, status flip, by-id read | reused by C2 detect + C3 idempotent mark-paid |
| monthly cron slot | host crontab `docker exec <ctr> node dist/scripts/X.js`; off-:00 convention | C2 cron `7 8 1 * *` (1st, off-:00) |

## Identifier diff
`$50` → `usdcMinPayoutLabel()` (SoT) · "by the 10th" → `payoutScheduleLabel()` (SoT `PAYOUT_BY_DAY_OF_MONTH=10`) · caps `$500/tx` + `$2000/batch` = ops env config (`PAYOUT_MAX_PER_TX_USD`/`PAYOUT_MAX_BATCH_USD`, NOT the frozen program SoT) · `owner_payout_address` · `algovault-referral-payout` (CDP account name) · `base` (network) · `/opt/.../send_telegram.sh` → replaced by `sendDigest`.

## Financial-action guardrail (ratified Q2)
All sends are **operator-triggered** — the Approve-all click; the first live test send only on Mr.1's explicit go to an address HE controls. No send ever auto-fires. `getPayoutSender()` returns the Stub until `cdpPayoutConfigured()` (all three CDP creds) is true.

## Gated follow-up (C3 live-send activation)
1. Mr.1 sets `CDP_WALLET_SECRET` on the host (`docker compose up -d mcp-server` to reload env).
2. `docker exec <ctr> node dist/scripts/cdp-payout-wallet-create.js` → prints the payout address.
3. Mr.1 funds it with ~one month's batch of USDC on Base (the PRIMARY risk bound).
4. Small operator test send → then enable Approve-all batch sends.
