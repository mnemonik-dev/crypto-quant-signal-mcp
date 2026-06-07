# SECURITY-FIX-X402-WEBHOOK-W1 — endpoint-truth.md (Step 0 / Plan-Mode)

**Wave:** SECURITY-FIX-X402-WEBHOOK-W1 (remediates the HIGH findings of `SECURITY-AUDIT-RECENT-FEATURES-W1`). **Author:** LEAD/INTEGRATOR · 2026-06-07.
**Gate verdict:** ✅ **CLEAN — proceed** (architect pre-approved via dispatch). 0 anchor mismatches (< 3 HALT), deploy transport confirmed live, no destructive surprise. The 5 Plan-Mode refinements below are resolved inline (none HALT-class).

---

## 1. Clone / HEAD
| Check | Result |
|---|---|
| clone | `~/code/crypto-quant-signal-mcp` (canonical; NOT the vault mirror) |
| HEAD == origin/main | `b58bf49` (aligned) |
| relation to audit | audit `8a78f25` is an **ancestor** ✓; HEAD moved only because the unrelated `OPS-PERFSTATS-SQL-PUSHDOWN-W1` wave (3 commits: 633b32b/bf4317b/b58bf49) landed on top. **Those commits touch only perf-stats code — x402.ts / webhook-*.ts are UNCHANGED since the audit** → anchors intact. |
| audit artifacts survive | `scripts/security-canary.mjs` + `docs/RUNBOOK-SECURITY-AUDIT.md` + 20 audit-dir files all tracked at HEAD ✓ |
| security-canary gate C | **RED** on `IPv4-mapped IPv6 → https://[::ffff:10.0.0.1]/` (WH-02) — must flip GREEN |

## 2. Fix-anchor re-grep (`claim | reality | resolution`) — **0 mismatches**
| Finding | Audit claim | Reality (re-grepped) | Resolution |
|---|---|---|---|
| X402-01 | `verifyX402Payment` ~`x402.ts:231` | `verifyX402Payment` at **:215**; the flattened-pool bug at **:231** (`const allReqs = Array.from(toolRequirements.values()).flat()` → `findMatchingRequirements(allReqs, …)`) | symbol confirmed; line shift only |
| X402-01 | `isPaymentSufficient` dead | **:364**, 0 callers (`isPaymentSufficient(toolName, paidAmount)`) — the correct per-tool check, unused | confirmed dead |
| X402 price src | `TOOL_PRICING` | **:58** (`TOOL_PRICING`), **:65** (`SIGNAL_TIMEFRAME_PRICING`); used flat at :177/:326/:366 | confirmed |
| X402 bind point | route↔price | route handler `x402-http-routes.ts:165` `app.post('/x402/'+tool)` has BOTH `tool` and `pendingSettlement`; calls `resolveLicense(headers)` (`license.ts:110`) which calls `verifyX402Payment(headers)` (`license.ts:119`, no tool) | **in-scope binding point = the route handler** (see §5.4) |
| WH-02 | `classifyIpv6` dotted-only | `webhook-ssrf.ts:77`; regex `:79` `/^::ffff:(\d{1,3}\.\d…)$/` (dotted only) → `:80 if (mapped) return classifyIpv4(mapped[1])` | confirmed; hex form bypasses |
| WH-01 | validated-IP discard + `fetch(hostname)` | `resolveAndAssertEgress` (`webhook-ssrf.ts:160`) returns **`Promise<void>`** (discards IP); single caller `webhook-delivery.ts:208`; `fetchImpl(url, {redirect:'error'})` at `:171` (called via `postWithTimeout` `:262`) | confirmed; **single caller** → safe to change return type |
| migration NNN | "latest 006" | actual highest = **009** (`004..009`) | **next migration = `010_processed_x402_payments.sql`** (prompt approximation corrected) |

## 3. Deploy transport (Step-0.3) — **CONFIRMED LIVE, not blocked**
- `scripts/deploy-direct.sh --verify-only` → **ALL ASSERTIONS GREEN** (container healthy, `tools/list=9`, dist markers present). The script SSHes to Hetzner and runs `git fetch origin + reset --hard origin/main + git clean` then `docker compose up -d --build --force-recreate --no-deps mcp-server` (DEV-2: pg + facilitator untouched). On-host build is authoritative (Dockerfile Stage 1 `npm ci`+build).
- **How the local commit reaches origin (no OAuth/HTTPS push):** local `origin` is HTTPS-OAuth (flagged) — local SSH push is unavailable (`git@github.com` = publickey-denied; `github-funnel` not locally resolvable). **BUT the host's `git@github-funnel:` deploy key has WRITE access** (dry-run push succeeded). Transport plan (root on both ends): **commit local → `git bundle create … origin/main..HEAD` → `scp` to host → host `git fetch <bundle>` + `git push origin FETCH_HEAD:main` (deploy-key) → `deploy-direct.sh` (host fetch+reset picks it up).** No OAuth/HTTPS push, no GHA. ✅
- If the host-push had failed → HALT. It did not.

## 4. Destructive-bash / DB-mutation table
| Op | Where | Safety |
|---|---|---|
| `CREATE TABLE IF NOT EXISTS processed_x402_payments(...)` | prod pg via SSH `docker exec …-postgres-1 psql -U algovault -d signal_performance` | **additive only** — no existing table/query touched; Data-Integrity safe; idempotent |
| host `git reset --hard origin/main` + `git clean -fd` | host `/opt/...` (inside deploy-direct) | converges host to origin/main (which WILL carry my 3 commits first); standard deploy step |
| `docker compose up -d --build --force-recreate --no-deps mcp-server` | host | mcp-server only; pg + facilitator NOT bounced (no DB/settle disruption) |
| host `git push origin FETCH_HEAD:main` | host deploy key | the ONLY origin mutation; my 3 fix commits → main |

No public-data deletion/truncation anywhere. Live flags preserved by deploy-direct's grep-guards (`X402_FACILITATOR`/`BAZAAR_DISCOVERABLE` default-append only if absent → architect-flipped `cdp`/`true` preserved).

## 5. Resolved Plan-Mode refinements (inline; none HALT-class)
1. **undici must become a DIRECT prod dependency.** `undici@6.24.1` is present but ONLY transitively via a **devDep** (`@nomicfoundation/hardhat-viem`) → **pruned from the prod image**. The WH-01 IP-pin (undici `Agent({connect:{lookup}})` per `fix-pins-ip.mjs`) needs it at runtime. Stream B adds `undici` to `package.json` `dependencies` (pin `^6.24.1`) — explicitly authorized ("egress dep unavoidable"). Stream J runs `npm install` so the lockfile + on-host build include it.
2. **`resolveAndAssertEgress` return-type change is safe** — single caller (`webhook-delivery.ts:208`). Change `Promise<void>` → `Promise<{address:string;family:number}>` (return the validated pinned IP; for literal-IP hosts return that IP).
3. **4th `tryClaim*` variant** — `tryClaimDelivery` (webhooks-store:260), `tryClaimEvent` (stripe-events-store:72), `tryClaimSignupEmailEvent` (signup-emails-store:131) already exist. x402 = 4th. Mirror `tryClaimEvent`'s `processed_<provider>_events` + `INSERT … ON CONFLICT DO NOTHING` shape; **flag a WIS** to extract a shared `tryClaim(table, pk)` helper (3-example-threshold passed).
4. **X402-01 in-scope fix = route-level binding** (no `license.ts` edit). `verifyX402Payment(headers)` (called inside `resolveLicense`) returns `_settlement.requirements` (the matched req). The route handler (`x402-http-routes.ts`, in-scope) knows `tool` + has `pendingSettlement` → after `resolveLicense`, assert the matched requirement == `toolRequirements.get(tool)` via a new exported `x402.ts` helper (`paymentBoundToTool(pendingSettlement, tool)`); mismatch → `send402`. Also harden `verifyX402Payment` to accept an optional `toolName` for direct per-tool matching. **Stream A must also check the MCP tool path** (`index.ts`) — if MCP tools are per-call x402-priced through the same flattened `resolveLicense`, note whether the route-level fix covers them or flag a follow-up (MCP dispatch is out of Stream-A scope).
5. **Migration file = `migrations/010_processed_x402_payments.sql`** (NNN=010).

## 6. Identifier diff (R-section vs live) — consistent
`X402_WALLET_ADDRESS=0x778A05280Fd8dB980E920fE9f31d0A8eAbD17d59` (== live 402 `payTo`); `X402_NETWORK=base-mainnet` → `eip155:8453`; USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; prices `get_trade_signal/get_market_regime $0.02`, `scan_funding_arb $0.01`, `get_trade_call FREE`. Prod flags live: `X402_FACILITATOR=cdp`, `BAZAAR_DISCOVERABLE=true`. CDP Bazaar listing live since 2026-06-06 (must stay `total:1`, 3 tools).

## 7. Rollback (verbatim)
```
cd ~/code/crypto-quant-signal-mcp && git revert --no-edit <webhook-fix-sha> <x402-idempotency-sha> <x402-price-sha> && scripts/deploy-direct.sh && scripts/deploy-direct.sh --verify-only
```
Target prior live src = `b58bf49` (perfstats CH3 — current live; `8a78f25` audit was docs-only, never deployed). `processed_x402_payments` is additive → leave it (unused after revert, harmless). Confirm markers ABSENT + listing still `total:1` post-rollback.

## 8. Streams
- **Stream A · X402-FIXER** — worktree `fix/x402-price-binding`. Writes: `x402.ts`, `x402-http-routes.ts`, `migrations/010_*.sql`, idempotency store module, `tests/x402*`. Pre-applies the table to prod. 2 commits.
- **Stream B · WEBHOOK-FIXER** — worktree `fix/webhook-ssrf-ip-pin`. Writes: `webhook-ssrf.ts`, `webhook-delivery.ts`, `webhook-api.ts`, `package.json`+lock (undici), `tests/webhook*`. 1 commit.
- **Stream J · LEAD** — merge (3 commits) → build → test → canary all-green → host-push transport → deploy-direct → marker/functional/listing-integrity verify → status.md + system-map.md.
Disjoint file sets (`x402-*` vs `webhook-*`; only B touches package.json; only A touches migrations) → conflict-free merge.
