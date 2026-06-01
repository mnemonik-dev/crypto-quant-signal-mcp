# OPS-FUNNEL-SNAPSHOT-CRON-FIX-W1 — Plan-Mode endpoint-truth

**Wave:** OPS-FUNNEL-SNAPSHOT-CRON-FIX-W1 (Tier-1, single-session, Plan-Mode).
**Probed:** 2026-06-01, ~10:40 UTC, by Code (read-only host probes; no rebase/push on prod yet).
**Verdict:** **0 fictional primitives → 0 HALT** (HALT threshold ≥3). One **sequencing correction** to spec R3 (deploy-wipe hazard) — does not block; folds into the execution order below.
**system-map edge-touch:** **NONE — internal change only** (push-resilience hardening of an in-repo host cron; no API field / MCP tool / postgres column / cron target / publish target / component added, removed, or renamed). Confirmed against the spec's Pre-Dispatch declaration.

---

## R2 — primitive probes (`claim | reality | resolution`)

| # | Claim (spec) | Reality (live probe) | Resolution |
|---|---|---|---|
| 1 | Script to patch: `scripts/commit-funnel-snapshot.sh`; push block anchored by `git -C "${REPO_ROOT}" push origin main`, the `BLOCKER-3` echo, and `EXIT_STATUS=3`; mirror line #s (~105–116) may drift | LIVE (`/Users/tank/code/crypto-quant-signal-mcp` @ `acf2aee` = origin/main): block is **lines 105–120**; `push origin main`@110, `BLOCKER-3` echo@113, `EXIT_STATUS=3`@114. `set -euo pipefail`@19, EXIT trap@35, per-path `git add`@88/90, 0/2/3 exit contract intact | ✅ Anchors found by content (not stale line #s). Replace 105–120. |
| 2 | Host prod checkout `/opt/crypto-quant-signal-mcp` = service WorkingDirectory + REPO_ROOT | `git -C /opt/crypto-quant-signal-mcp` resolves; HEAD on `main` | ✅ Confirmed |
| 3 | `origin` URL on host = SSH alias `github-funnel:…`; new fetch must use same remote | `origin  git@github-funnel:AlgoVaultLabs/crypto-quant-signal-mcp.git (fetch/push)` | ✅ `git pull --rebase ... origin main` + `git push origin main` share identical auth |
| 4 | Stuck commit `69a7bed` ("chore(funnel): auto-snapshot 2026-06-01") intact + un-pushed on host | `cat-file -t 69a7bed`=commit; host `main` HEAD = **`69a7bed`**, `[origin/main: ahead 1]`. Parent = `89496e1`. 2 files / 197 ins under `activation-funnel/snapshots/` | ✅ Present, un-pushed, recoverable |
| 5 | `--autostash` is real (verified git 2.34.1 dev sandbox) | **Host git 2.43.0** — `--autostash` supported on both `pull --rebase` and `rebase` | ✅ Real on the actual host (newer than spec's sandbox) |
| 6 | Working tree permanently dirty with deploy-injected `landing/{how-it-works,index,skills,verify}.html` | `status --porcelain`: ` M README.md`, ` M landing/how-it-works.html`, `index.html`, `skills.html`, `verify.html`. **All tracked ` M` (no untracked).** | ⚠️ **README.md is also dirty** (spec said landing-only). Strategy below discards ALL tracked mods, so this is covered. |
| 7 | Deploy host-update strategy decides autostash-pop handling | `deploy.yml:82-84` = `git fetch origin && git reset --hard origin/main && git clean -fd`, then `node scripts/snapshot-landing-data.mjs` re-injects `landing/*.html`. **All working-tree dirt is ephemeral by construction.** Caddy serves a **separate** copy: `cp landing/*.html /var/www/algovault/` (deploy.yml:103) — the cron NEVER writes to `/var/www/algovault/`. | ✅ See "Autostash strategy" + "Deploy-wipe hazard" below |
| 8 | Autostash-pop: does `rebase --autostash origin/main` pop cleanly vs conflict? | `git diff --name-only 89496e1 origin/main -- README.md landing/` = **EMPTY**. Origin advanced `89496e1..acf2aee` = **one commit, `ops/monitoring/shadow-cpu-gate-48h.sh` only** (a `paths-ignore`d path — deploy.yml:13). The divergence does NOT intersect the dirty set → **autostash pop applies cleanly** for the recovery. | ✅ Clean for recovery; generator-level guarantee added below for any future divergence |
| 9 | Systemd units repo-tracked; `OnFailure=…cron-alert@%n`; timer `Mon 10:00 UTC` Persistent + RandomizedDelaySec=900; next fire Mon 2026-06-08 | `systemctl cat` confirms unit; `systemctl list-timers`: **NEXT Mon 2026-06-08 10:14:54 UTC**, LAST Mon 2026-06-01 10:14:26 UTC | ✅ Confirmed (10:14:xx = base 10:00 + randomized delay) |
| 10 | OnFailure alert script `scripts/funnel-cron-alert.sh` | Present, `-rwxr-xr-x ... 2278B`. Body line 47: `Action: dispatch OPS-FUNNEL-SNAPSHOT-CRON-FIX-W{NEXT}` (W{NEXT} template per CLAUDE.md). Pipes to `/opt/algovault-monitoring/send_telegram.sh` `FUNNEL_SNAPSHOT_CRON_FAILED CRITICAL_PERSISTENT` | ✅ Real; copy tweak in R4 below (the recommendation becomes stale once this wave ships) |
| 11 | Env file `/etc/algovault/funnel-snapshot.env` (DATABASE_URL) | Present, `-rw------- ... 90B` (mode 600) | ✅ Confirmed |
| 12 | `scripts/**` NOT in deploy.yml `paths-ignore` → editing the script triggers a deploy that updates the host checkout | `paths-ignore` = `activation-funnel/snapshots/**`, `activation-funnel/README.md`, `ops/systemd/**`, `ops/monitoring/**`. **`scripts/**` absent** → script edit DOES deploy. `audits/**` also absent → audit commit also deploys (bundled, harmless). | ✅ Confirmed |
| 13 | Likely root cause: a `paths-ignore`d commit advanced origin without redeploying the host | **CONFIRMED EXACTLY.** `acf2aee` (the +1 commit) touches only `ops/monitoring/shadow-cpu-gate-48h.sh` (paths-ignored) → advanced origin, no host deploy → host stayed at `89496e1`-deployed state → cron committed `69a7bed` on the stale base → `! [rejected] main -> main (fetch first)` (journal 10:14:31Z, `status=3`, OnFailure fired) | ✅ Hypothesis verified |

---

## Autostash strategy (AC3 — provably no conflict markers in served `landing/*.html`)

**Two independent guarantees:**

1. **Architectural (primary):** the cron operates on the repo working tree (`/opt/crypto-quant-signal-mcp/landing/*.html`), but **Caddy serves a separate copy** (`/var/www/algovault/*.html`), refreshed only at deploy time via `cp landing/*.html /var/www/algovault/` (deploy.yml:103). The cron never writes to `/var/www/algovault/`. Therefore **no rebase/autostash outcome can place conflict markers in the served files** — they are not the same files.

2. **Structural (defense-in-depth, generator-level):** the routine runs `git checkout -- .` at the top of each attempt to **discard the ephemeral deploy-injected tracked edits before rebasing**, so the tree is clean and `--autostash` has **nothing to stash → nothing to pop → no conflict markers even in the repo tree**, for ANY future divergence (not just today's paths-ignored one). Safe because: (a) `deploy.yml` itself does `git reset --hard origin/main` on every deploy → the host treats the working tree as disposable by contract; (b) `landing/*.html` regenerate via `scripts/snapshot-landing-data.mjs` on the next deploy; (c) `README.md` is a repo file only — never served. `--autostash` is retained on the (now-clean) `pull --rebase` as a belt-and-suspenders no-op, satisfying AC1's literal `rebase --autostash` requirement.

Probe-confirmed: for today's actual divergence the pop is clean anyway (row 8) — the structural guard generalizes it.

---

## Deploy-wipe hazard → R3 execution-ORDER correction (the one sequencing fix)

**Spec R3 says:** "After R1 is committed + deployed, SSH to the host and run the new routine ... to land 69a7bed."

**Problem:** pushing the script fix touches `scripts/**` (not paths-ignored) → triggers the deploy → the deploy runs **`git reset --hard origin/main` (deploy.yml:83)**, which **discards the un-pushed `69a7bed`** from host `main` (it survives only in the reflog; the snapshot files vanish from the working tree). Running the routine *after* the deploy would therefore find `69a7bed` already gone — today's snapshot would be lost (Data-Integrity hit + AC4 miss).

**Correction — recover BEFORE the script-fix deploy:**

1. **Recover first** (gated on approval — this is the rebase/push on prod): on the host run the routine's exact happy-path commands —
   `git -C /opt/crypto-quant-signal-mcp pull --rebase --autostash origin main && git -C /opt/crypto-quant-signal-mcp push origin main`.
   `69a7bed` rebases onto `acf2aee` (probe-confirmed clean pop) → lands on `origin/main` as a new SHA (rebase re-parents it; the **snapshot data** is preserved — that is AC4's intent). This push touches only `activation-funnel/snapshots/**` → **paths-ignored → no deploy, no `reset --hard`**. This step doubles as a **live happy-path proof** of the routine's `pull --rebase --autostash → push` commands against real origin.
2. **Then deploy the fix:** local `git pull --rebase` (fast-forwards local `acf2aee` → the rebased tip), edit script, per-file `git add`, commit, push. Now `origin/main` = `…→69a7bed'→SCRIPT_COMMIT`; the deploy's `reset --hard origin/main` lands `SCRIPT_COMMIT` **on top of the already-pushed `69a7bed'`** → snapshot preserved, new script on host.
3. **Verify on host:** grep for `push_with_resync` / `rebase --autostash`; `systemctl start` → snapshot writer sees today's snapshot already present → `no new snapshot … exit 0` (proves host integration + **no false TG on the success path**); confirm timer armed Mon 2026-06-08.

The full push/rebase/retry/**retry-exhaustion** logic is proven separately by the throwaway bare-repo harness (R3 second half) — never by mutating real `main`.

---

## Identifier diff (spec R-section vs AC-section vs live)

| Identifier | Spec | Live | Match |
|---|---|---|---|
| Host | `204.168.185.24`, `~/.ssh/algovault_deploy`, `root` | SSH OK | ✅ |
| Prod checkout | `/opt/crypto-quant-signal-mcp` | resolves | ✅ |
| Edit checkout | `/Users/tank/code/crypto-quant-signal-mcp` | @ `acf2aee` = origin/main (clean but for unrelated untracked audit files) | ✅ |
| Remote | `github-funnel:AlgoVaultLabs/crypto-quant-signal-mcp.git` | exact | ✅ |
| Stuck SHA | `69a7bed` | host HEAD `69a7bed45d1…` | ✅ |
| Origin tip | (implied behind) | `acf2aeeb209…` | ✅ |
| Unit / timer / alert / env | as cited | all present | ✅ |
| `git version` | 2.34.1 (sandbox) | 2.43.0 (host) | ✅ (both support `--autostash`) |

---

## Chosen implementation (R1)

Replace `scripts/commit-funnel-snapshot.sh` lines 105–120 with a self-contained `push_with_resync()` (extraction-ready per the 3-example-threshold deferral): bounded 3 attempts, backoffs 5/15/45s, each attempt = `git checkout -- .` (discard ephemeral edits) → `git pull --rebase --autostash origin main` (abort+retry on conflict) → `git push origin main` (return 0 on success). All attempts fail → preserve local commit, `EXIT_STATUS=3; exit 3` (→ OnFailure TG = genuine stuck-push escalation). `set -euo pipefail`, EXIT trap, 0/2/3 contract, per-path `git add` all preserved. **No version bump / CHANGELOG / publish** (internal code wave).
