# DEPLOY-DIRECT-HETZNER-W1 — Plan-Mode endpoint-truth

**Wave**: DEPLOY-DIRECT-HETZNER-W1 (META / internal ops-infra)
**Probed**: 2026-06-06 ~06:10 UTC (host time `Sat Jun 6 06:10 UTC 2026`)
**Objective restatement**: GHA auto-deploy is stalled (the `AlgoVaultFi` GitHub account is web-OAuth-flagged → Actions suspended). `origin/main` is at `c840be7` (the HL coalesced-cache stampede fix) but the live host is still running `13cbddb` (pre-fix) and actively degrading. Manually replicate `deploy.yml`'s on-host SSH block to land `c840be7`, then capture it as a reusable `scripts/deploy-direct.sh`. **No npm publish, no version bump, no registry, no Discussion** — server-only.

---

## §0 — system-map edge-touch enumeration

**NONE — internal change only.** This wave moves already-shipped code (`c840be7`) onto the running host via manual transport. No new component, no producer/consumer edge, no route, no response-shape change, no public surface. `tools/list` stays 9. → **`system-map.md updated: n-a`**.

(The code *being deployed* — `src/lib/coalesced-cache.ts` etc. — already had its system-map edge added by OPS-HL-CACHE-STAMPEDE-GENERATOR-W1 `system-map.md updated: Y`. This transport wave adds nothing.)

---

## §1 — Probe table (`claim | reality | resolution`)

| # | Spec claim / primitive | Probe command | Reality | Resolution |
|---|---|---|---|---|
| 1 | SSH `root@204.168.185.24` reachable with `~/.ssh/algovault_deploy` | `ssh -i ~/.ssh/algovault_deploy … rev-parse HEAD` | ✅ connected; commands ran | REAL — key + host good |
| 2 | Canonical deploy dir `/opt/crypto-quant-signal-mcp/` | `git -C /opt/crypto-quant-signal-mcp rev-parse HEAD` | ✅ `13cbddb7c91…` | REAL |
| 3 | Host is **pre-`c840be7`** | `git rev-parse HEAD` + `docker exec mcp-server-1 ls /app/dist/lib/coalesced-cache.js` | HEAD=`13cbddb`; coalesced-cache.js **`No such file` → CONFIRMED_ABSENT** | REAL — definitively pre-fix |
| 4 | `c840be7` is `origin/main` HEAD | `git fetch origin` + `git log -1 origin/main` | ✅ `13cbddb..c840be7 main -> origin/main`, `[new tag] v1.20.1` | REAL — fetch lands `c840be7` |
| 5 | **Transfer path 1** (Hetzner can reach repo) | `git -C … fetch origin` | ✅ **FETCH_OK** | **PATH 1 SELECTED** — remote is `git@github-funnel:…` (SSH deploy key, *unaffected by the web-OAuth account flag*); paths 2/3 unneeded |
| 6 | `deploy.yml` on-host step list | `Read .github/workflows/deploy.yml` | ✅ 14.6 KB; SSH block lines 72–240 enumerated (§2) | REAL |
| 7 | Build context — image builds on host (not GHA `dist/`) | `Read Dockerfile` + `Read docker-compose.yml` | ✅ `mcp-server: build: .`; Dockerfile Stage 1 runs `npm ci`+`npm run build`+`build:knowledge` INSIDE image; `up -d --build` recompiles on host | REAL — **local `dist/` irrelevant**; transferring source (git reset) suffices |
| 8 | Container name `crypto-quant-signal-mcp-mcp-server-1` + service `mcp-server` | `docker compose ps` | ✅ `mcp-server-1` (Up 3h, 127.0.0.1:3000), `postgres-1` (Up 3h), `facilitator-1` (Up 3h, healthy) | REAL |
| 9 | C4 gate table `rate_limit_events` (venue/kind/ts) exists | `psql -c "SELECT count(*) … venue='Hyperliquid' AND kind='throw'"` | ✅ query ran; **15m=407, 70m=1975, lifetime=17569** | REAL — baseline captured (§4) |
| 10 | `node` available on host (snapshot/indexnow run vs fail-open) | `command -v node` | ✅ `/usr/bin/node` | REAL — snapshot **runs** (re-injects live SoT into landing fallbacks) |
| 11 | Host `package.json` version (OLD_VERSION for release-post detection) | `grep version package.json` | `1.20.0` | REAL — after reset → `1.20.1`; OLD≠NEW → **release-post block WOULD fire** → see DEV-1 |
| 12 | `landing/*.html` (Caddy-synced) unchanged by the reset | `git diff --stat 13cbddb..c840be7 -- landing/` | **0 landing files changed** (only `README.md` +7/-2) | REAL — **ZERO editorial public-copy change**; README not Caddy-synced |

**Fictional primitives: 0.** (HALT threshold is ≥3.) → **PROCEED class.**

---

## §2 — On-host step sequence (replicated from `deploy.yml` SSH block, in order)

| Step | deploy.yml line | Action | Notes |
|---|---|---|---|
| 1 | 72 | `cd /opt/crypto-quant-signal-mcp` | |
| 2 | 75 | `OLD_VERSION=$(grep -m1 '"version"' package.json …)` | =`1.20.0`; informational only (release-post skipped per DEV-1) |
| 3 | 82 | `git fetch origin` | transfer path 1 (proven) |
| 4 | 83 | `git reset --hard origin/main` | lands `c840be7`; **discards the dirty host tree** (`M README.md`, `M landing/{index,how-it-works,skills,verify}.html` = last deploy's snapshot edits) — *this is exactly why deploy.yml uses reset-hard, not pull* |
| 5 | 84 | `git clean -fd` | |
| 6 | 97 | `node scripts/snapshot-landing-data.mjs … \|\| echo …` | fail-open; node present → runs; re-injects **live SoT track-record literals** into `data-tr-field` spans + JSON-LD (automated, every deploy; not editorial) |
| 7 | 99–123 | Caddy sync: `cp landing/*.html /var/www/algovault/` + `_design/*` + `js/*` + `assets/*` + `*.txt` + `sitemap.xml` | landing content byte-identical at `c840be7`; only SoT-refreshed numbers differ |
| 8 | 131 | `node scripts/indexnow-ping.mjs … \|\| echo …` | fail-open; low-value (landing unchanged) but kept for fidelity |
| 9 | 147–188 | 3× idempotent `.env` append loops (`ENABLE_PERTF_*`, `ENABLE_R4_RELAX`/`R4_RELAX_DIRECTION`, `X402_FACILITATOR`/`BAZAAR_DISCOVERABLE`) | grep-guarded → keys already present from prior deploys → **NO-OP**; preserves any architect-flipped values |
| 10 | 197 | **[DEV-2]** `docker compose up -d --build --force-recreate mcp-server` | **service-scoped** (see DEV-2) — rebuilds mcp-server image from `c840be7` on host, recreates only that container |
| 11 | 198 | `docker compose ps` | confirm all Up |
| 12 | 203–240 | **[DEV-1] SKIPPED** — version-change release-post block | see DEV-1 |

---

## §3 — Flagged deviations from `deploy.yml` literal text (both task-directed; "fix inline + flag")

### DEV-1 — SKIP the version-change release-post block (lines 203–240)
- **Trigger**: block fires only when `OLD_VERSION != NEW_VERSION`. Host=`1.20.0`, `c840be7`=`1.20.1` → it **would fire**, running `docker exec mcp-server-1 node dist/scripts/agent-forum-post.js --type=release --version=1.20.1` + a self-audit.
- **Why skip**:
  1. **Non-release-wave LAW** — task is server-only; "NO `vX.Y.Z` Discussion / release announcement." Spec Context lines 20–23.
  2. **Duplicate** — Discussion #26 for v1.20.1 already exists (NPM-PUBLISH-v1.20.1-W1, status.md 04:02).
  3. **Split-brain** — announcing 1.20.1 "released" while npm/registry are still 1.20.0 (publish blocked by the flag) would be a false release signal.
  4. **Would fail anyway** — `agent-forum-post` posts via the flagged GitHub account; non-fatal (`|| echo`) but pointless.
- **Resolution**: omit lines 203–240. `deploy-direct.sh` does **not** include release-post (a release-pipeline concern, orthogonal to a server deploy, and dependent on the very GitHub that's down).

### DEV-2 — service-scoped recreate (`… mcp-server`) vs all-services (`… --force-recreate`)
- **deploy.yml**: `docker compose up -d --build --force-recreate` (no service → recreates `mcp-server` + `postgres` + `facilitator`).
- **This wave**: `docker compose up -d --build --force-recreate mcp-server`.
- **Why**:
  1. **Task-directed** — Requirement 3 + Context line 19 *explicitly* say `docker compose up -d <service>`.
  2. Only `mcp-server` carries the `c840be7` code delta (cache fix in its image) + is the only consumer of the `.env` appends.
  3. `facilitator` unchanged across `13cbddb..c840be7` → no rebuild needed.
  4. Avoids an unnecessary **postgres recreate** — keeps the C4 measurement baseline continuous + respects the OOM-sensitive postgres (Hetzner OOM history 2026-06-04).
  5. `--force-recreate mcp-server` preserves deploy.yml's env-race defense for the one service that needs it; `--build` changes the image → recreation happens regardless.

---

## §4 — C4 HL-throw baseline (pre-deploy, for the gate)

| Window | HL throws (`venue='Hyperliquid' AND kind='throw'`) | ≈ rate |
|---|---|---|
| last 15 min | **407** | ~27/min |
| last 70 min | **1975** | ~28/min |
| lifetime (since recorder deploy ~02:00 UTC) | 17569 | ~70/min avg over 4h+ |

> Note: somewhat below the spec-cited `5,375/70min` peak (measured at 03:26 during OPS-HL-INTERACTIVE-SATURATION-INVESTIGATION). The throw rate is bursty; current window is a calmer moment but **still an active stampede** (~28/min). The C4 gate is a *relative collapse*, so the measured **407/15m** is the comparison baseline. Post-deploy (coalesced single-flight + negative-cache + process-gate) should drop the stampede component toward near-zero.

---

## §5 — Identifier diff (R-section ↔ Context ↔ AC), pre-state-mutation

| Identifier | Value (consistent across spec sections) | Probed reality |
|---|---|---|
| SSH host | `204.168.185.24` | ✅ |
| SSH key | `~/.ssh/algovault_deploy` | ✅ (functional) |
| deploy dir | `/opt/crypto-quant-signal-mcp/` | ✅ |
| container | `crypto-quant-signal-mcp-mcp-server-1` | ✅ |
| service | `mcp-server` | ✅ |
| target SHA | `c840be7` | ✅ = origin/main HEAD |
| from SHA | `13cbddb` (pre-fix) | ✅ = host HEAD |
| C4 table | `rate_limit_events` | ✅ exists |
| proof module | `/app/dist/lib/coalesced-cache.js` | ✅ absent pre / will exist post |

No drift between cited identifiers. ✅

---

## §6 — Verification plan (post-deploy, Requirement 4 + AC)

1. `docker exec crypto-quant-signal-mcp-mcp-server-1 ls /app/dist/lib/coalesced-cache.js` → **present** (proof `c840be7` built into the image).
2. `/mcp` 3-step streamable-HTTP handshake (`initialize` → `Mcp-Session-Id` → `notifications/initialized` → `tools/list`) → **9 tools** (host loopback `127.0.0.1:3000`). Pre-deploy known-9 (status.md, repeated).
3. **C4 gate** — over a ≥15-min post-deploy window: `SELECT count(*) FROM rate_limit_events WHERE venue='Hyperliquid' AND kind='throw' AND ts > now() - interval '15 minutes'` **collapses well below 407**; and `get_trade_call BTC` on Hyperliquid returns an **HL-scored** result (not a Binance fallback).
4. `scripts/deploy-direct.sh --verify-only` re-runs steps 1–3 green.

---

## §7 — Reusable artifact (Requirement 5, the compounding deliverable)

- `scripts/deploy-direct.sh` — idempotent, fail-fast (`set -euo pipefail`), reads canonical SSH target from constants, modes: default (full deploy = §2 steps 1–11) + `--verify-only` (§6 only). Does **not** carry the release-post (DEV-1). Retires the "GitHub-outage = can't ship the server" bug class (generator-level fix).
- `docs/RUNBOOK-DEPLOY-DIRECT.md` — "when GitHub Actions are down (account flag / Actions incident / rate-limit), run `scripts/deploy-direct.sh`."
- Commit **locally, per-file** (clean-baseline `git status -s` check + per-file `git add` + `git diff --cached` audit). **Push deferred** (account flagged) — status.md notes it pushes on un-flag; the deploy does not depend on the commit reaching origin.

---

## §8 — Safe-window note

Seeds are mid-flight at probe time (3m-standard + HL execs into `mcp-server-1`) — and *piling up*, a symptom of the very stampede this fixes. The on-host `--build` runs while the **old** container stays live; only the final ~3 s container swap interrupts in-flight seed execs, which are fail-soft + retry next cycle. Prod is degraded now, so deploying promptly is net-positive; no destructive DB op, so no hard safe-window gate required.

---

## §9 — Verdict

**PROCEED** — 0 fictional primitives; transfer path 1 proven; build context understood (host-build, dist-irrelevant); 2 task-directed deviations flagged + justified (DEV-1 skip release-post, DEV-2 service-scoped recreate); ZERO public-copy/version/publish/Discussion side-effects; C4 baseline captured. **Awaiting architect ratification before state mutation (git reset / build / container recreate).**
