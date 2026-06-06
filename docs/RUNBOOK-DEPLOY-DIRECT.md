# RUNBOOK — Direct Hetzner deploy (GitHub-outage fallback)

**When to use:** GitHub Actions can't fire, so the normal auto-deploy
(`.github/workflows/deploy.yml`, triggered on push to `main`) never runs, yet
`origin/main` carries a fix that must reach the live MCP server. Causes seen in
the wild:

- **Account flag** — the `AlgoVaultFi` org/account is flagged → Actions
  suspended + `mcp-publisher` OAuth blocked (DEPLOY-DIRECT-HETZNER-W1,
  2026-06-06; root-caused by NPM-PUBLISH-v1.20.1-W1).
- **GitHub Actions incident** — `githubstatus.com` shows Actions degraded.
- **Actions minutes / API rate-limit** exhausted.

The auto-deploy *trigger* is broken in all three cases, but the deploy
*mechanism* (SSH → Hetzner → `git reset` → on-host rebuild → recreate) is not.
Code holds the SSH key; the repo's on-host remote (`git@github-funnel:…`, an SSH
deploy key) reaches origin independently of the web-OAuth flag.

---

## One command

```bash
cd ~/code/crypto-quant-signal-mcp
scripts/deploy-direct.sh            # full deploy + verify
scripts/deploy-direct.sh --verify-only   # post-deploy checks only (no mutation)
```

That's it. The script SSHes to the canonical Hetzner host and runs
`deploy.yml`'s on-host SSH block verbatim (git fetch + `reset --hard
origin/main` + clean → snapshot-landing → Caddy sync → IndexNow → idempotent
`.env` appends → `docker compose up -d --build --force-recreate --no-deps
mcp-server`), then verifies.

SSH endpoint is read from CLAUDE.md canonical values, overridable by env:

```bash
DEPLOY_HOST=… DEPLOY_USER=… DEPLOY_KEY=~/.ssh/algovault_deploy scripts/deploy-direct.sh
```

---

## What it does NOT do (by design)

| Not done | Why |
|---|---|
| `npm publish` / MCP-registry publish | Needs GitHub OIDC provenance + `mcp-publisher` OAuth — both blocked by the same outage. Manual `npm publish` loses Sigstore provenance + creates a split-brain (npm vs health). npm/registry resume on the normal pipeline once GitHub is back. |
| version bump / CHANGELOG / `vX.Y.Z` Discussion | Server deploy ≠ release. The tree already carries whatever version `origin/main` has; this only transports it. |
| **release-post** (`agent-forum-post --type=release`) | `deploy.yml` runs this on a version change; this script omits it (**DEV-1**). It is a release-announcement side-effect, out of scope for a server deploy, would duplicate an existing release Discussion, and posts via the down GitHub anyway. |
| recreate postgres / facilitator | **DEV-2** — only `mcp-server` carries the code delta + reads the `.env` flags. `--no-deps` leaves the DB + facilitator untouched (no bounce). `deploy.yml` force-recreates all services; here that is unnecessary and riskier. |

---

## Why a plain `git pull` is not enough / why it's safe

- The host checkout is routinely **dirty** (the snapshot-landing script rewrites
  `landing/*.html` every deploy and never commits). `git pull` no-ops on
  divergence; `git fetch && git reset --hard origin/main && git clean -fd` always
  converges. `.env` is git-ignored → survives `clean -fd`.
- The image **builds on the host** (Dockerfile Stage 1 runs `npm ci` + `npm run
  build` inside the build context). So landing *source* is all that must
  arrive; the local working tree / `dist/` is irrelevant.
- Build-then-swap: `docker compose up -d --build` builds first and only swaps the
  container on a successful build. A build failure leaves the old container
  running — no half-deploy.

---

## Verify / gate

`scripts/deploy-direct.sh --verify-only` (read-only, safe any time) asserts:

1. container answers `node -e` (healthy),
2. `/app/dist/lib/coalesced-cache.js` + `runtime.js` present (a fix-specific
   proof module — swap for whatever the current fix adds),
3. `/mcp` 3-step handshake `tools/list` == 9,

and prints (operator reads): the per-minute HL `rate_limit_events` throw counts
over the last 15 min (look for the collapse at the deploy minute) and a
`get_trade_call BTC exchange=HL` result (`exchange:HL` = HL reachable, not a
Binance fallback).

---

## If it fails

- **SSH unreachable** → host/network problem; escalate (the deploy can't proceed).
- **`git fetch` 404 / repo hidden** → the open-source repo got hidden too. Fall
  back to a git bundle: `git bundle create /tmp/avq.bundle <old>..<new>` locally
  → `scp` to the host → `git -C /opt/crypto-quant-signal-mcp pull /tmp/avq.bundle
  main`. Last resort: `rsync -a --exclude .git --exclude node_modules` the local
  tree onto `/opt/crypto-quant-signal-mcp/`.
- **Build fails** → old container keeps running (no half-deploy). Read the build
  log, fix on `main`, re-run.
- **Container unhealthy after recreate** → `--verify-only` exits non-zero. Inspect
  `docker logs crypto-quant-signal-mcp-mcp-server-1`; roll back with `git -C
  /opt/crypto-quant-signal-mcp reset --hard <previous-sha>` + re-run.

---

## After GitHub is back

The deploy does **not** depend on the commit (this runbook + script) reaching
origin. When the flag/outage clears, push the staged commit and let the normal
pipeline (`publish-npm.yml`, MCP-registry publish, release Discussion) resume for
the distribution side. See `audits/DEPLOY-DIRECT-HETZNER-W1-endpoint-truth.md`.
