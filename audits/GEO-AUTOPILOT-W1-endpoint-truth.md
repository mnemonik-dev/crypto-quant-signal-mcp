# GEO-AUTOPILOT-W1 — endpoint-truth.md (Plan-Mode Step 0)

**Wave:** GEO-AUTOPILOT-W1 (Tier-2 Bulk-Spec, C1→C3 sequential, additive to GEO-MEASUREMENT-W4) · **Target ICP: META**
**Probed:** 2026-06-15/16 UTC · **Probed-against:** `origin/main` (the live deploy line)
**Verdict:** ✅ **ARCHITECT-RATIFIED 2026-06-16** — R1–R6 confirmed; Q1–Q4 resolved (§0.1 below OVERRIDES the spec + §4/§6). Proceeding C1→C2→C3 in a worktree off `2d0576d`. No version bump.

## 0.1 Architect ratifications (2026-06-16) — OVERRIDE the spec + §3/§4/§6 where they differ

- **R1–R6:** all confirmed. Build base = worktree off `origin/main 2d0576d`.
- **Q1 (topology) — Postgres-boundary CONFIRMED.** `geo-decide.ts` stays PURE (`renderDecisionBrief()→string`; NO vault FS write from the cron). NEW append-only table **`geo_decisions`** (NOT a column on `geo_content_gaps` — keep the gap-list single-responsibility), one row per weekly `run_id`:
  `run_id uuid, created_at timestamptz default now(), priority_tier text, ranked_candidates jsonb, rendered_brief text, chosen_move text, status text default 'proposed' CHECK (status IN ('proposed','approved','executed','measured')), gap_ref bigint NULL`. **status = TEXT+CHECK (not a PG enum)** — avoids `ALTER TYPE`. Dashboard renders the latest row; the digest carries the one-move summary + dashboard link; **Cowork materializes `Prompt/geo-decision-<date>.md` FROM `geo_decisions`** (step 1 of the ritual). `status` flips proposed→approved→executed→measured; the attribution loop reads it.
- **Q2 (weights) — gate + formula APPROVED; branded LIFTED 0.4→0.8.** Final `revenue_proximity = {head:1.0, branded:0.8, niche:0.6}` = expected-VALUE weight (volume × buyer-qualification; branded = lower-volume but higher-qualified + moat-aligned; win-prob is NOT double-counted — it lives in `expected_lift`). **DO NOT mutate the shipped `geo-gap-list.ts:29 TIER_WEIGHT`** (= coverage-weight, drives the editorial pipeline). The two diverge INTENTIONALLY → one-line cross-ref comment in BOTH (`geo-gap-list.ts:29` ↔ `geo-objective.yaml`).
- **Q3 (digest) — wording APPROVED + `candidate action:` fast-path line.** When a drafted action spec already covers the chosen move, name it: `candidate action: <path> (already drafted)`. This week's eligibility move → `Prompt/fix-gemini-google-index-presence-w1.md`.
- **Q4 (eligibility) — reuse `computeIndexPresence` as the gate input** (single-derivation; $0; already detects gemini blocked). DROP the new per-engine `site:` HTTP probe. Crawler-hit deltas = graceful-empty (deferred until access-logging exists; does NOT block C2). Look-alike watch uses `isOwnHost` (R5).

---

## 0. Canonical repo + build base (IDENTIFIER CORRECTION — read first)

The dispatch path is **stale**. Two clones exist under `/Users/tank`:

| Path | HEAD | version | GEO state |
|---|---|---|---|
| `/Users/tank/crypto-quant-signal-mcp` (prompt's stated path) | `74507f3` | **1.18.2** | ❌ STALE — missing `geo-digest.ts`, `geo-gap-list.ts`, `geo-demand-mining.ts`; on an unrelated x402/webhooks commit line |
| **`/Users/tank/code/crypto-quant-signal-mcp`** (canonical, per memory `reference_canonical_repo_clone.md`) | `e7360d3` | **1.20.1** | ✅ has all W2–W4 GEO artifacts; this is the deployed line |

- The prompt says *"build additively on the W4 digest"* — the W4 digest artifacts **only exist in `code/`**, confirming `code/` is canonical.
- `code/` HEAD `e7360d3` is **1 commit BEHIND `origin/main` (`2d0576d`)**. `2d0576d` = `INVESTIGATE-LOOKALIKE-DOMAINS-W1` (deployed 2026-06-15 15:48 UTC), which **exports `isOwnHost()` that C2 must reuse** (confirmed: 3 occurrences, 1 export, at `origin/main:src/lib/geo-extractor.ts`).
- **Worktree-LAW** (CLAUDE.md): 10 parallel worktrees + the shared `code/` main checkout are live. The build MUST run in a **fresh worktree off `origin/main` (`2d0576d`)** — `scripts/cc-session.sh new geo-autopilot-w1` (present, confirmed) — NOT in the shared `code/` checkout (which lacks `isOwnHost`). Created **post-approval**.

---

## 1. Step-0 system-map edge enumeration (touched edges)

| Producer | → Consumer | Type | Chapter | Live status |
|---|---|---|---|---|
| `landing/Prompt/geo-objective.yaml` (NEW SoT) | `geo-decide.ts` scorer | NEW internal SoT→consumer | C1 | new |
| `geo_mentions` + `geo_source_citations` (W2 map) + `geo-objective.yaml` | `geo-decide.ts` → decision brief | NEW consumer + NEW artifact | C1 | tables LIVE + populated |
| presence-tier index-presence (`computeIndexPresence`, **already live**) + look-alike watch | `geo-decide.ts` eligibility gate | NEW internal consumer of an **existing** signal | C2 | gemini currently BLOCKED |
| `geo-decide.ts` output | the GEO weekly digest (`buildDigest`→`sendDigest`→Telegram→Mr.1) | **MUTATES the existing GEO-W1/W4 digest→Telegram edge** | C3 | edge LIVE (Mon 08:00 UTC) |

> The mutated edge is the **GEO-MEASUREMENT-W1/W4 in-container digest → `sendDigest` → Telegram → Mr.1** informational edge — **NOT** the host-side `send_telegram.sh` operator-action contract. Exact `system-map.md` edge-ID pinned at C3 build (file is 261 KB; the GEO digest edge was last touched by GEO-CONTENT-W2 with "edge mutations: NONE").

---

## 2. Primitive probe table — `claim | reality | resolution`

| # | Spec claim | Reality (probed) | Resolution |
|---|---|---|---|
| 1 | digest in `src/scripts/geo-weekly-cron.ts`; "one move" heuristic | ✅ cron is thin (296 ln); body in **pure `src/lib/geo-digest.ts` `buildDigest()`**. "ONE MOVE" = `geo-digest.ts:333-342`, reads `data.topGap` (`TopGapBrief`) from `geo_content_gaps` (top by `computed_at DESC, rank_score DESC`). Section order: header → BLOCKED-ELIGIBILITY banner → WHAT MOVED → DID LAST WEEK'S MOVE WORK → WHO'S WINNING → ONE MOVE → link | C3 **replaces/extends the ONE MOVE section** (in `geo-digest.ts`) with the scored decision handoff. Additive: keep all other sections. |
| 2 | source-citation map `geo_citations`/`geo_sources` | ❌ FICTIONAL names. Real table: **`geo_source_citations`** (cols: `id, run_id, ran_at, query_id, model, query_tier, source_url, source_domain, attributed_to, competitor_name, rank`). Populated: **1554 neutral / 46 competitor / 28 algovault**. | Scorer reads `geo_source_citations`. `attributed_to ∈ {neutral, competitor, algovault}` (no suspect bucket yet — see C2). |
| 3 | `\d geo_mentions` (confirm cols) | ✅ `geo_mentions` LIVE: `model, cited, ran_at, share_of_voice, mention_found, retrieval, query_tier, query_id`. 318 rows, 2026-05-25→06-15. Tiers in data: **head 144 / niche 96 / branded 36 / presence 12** (+30 legacy-null). `geo_content_gaps` = **1 row** (W25: `best-mcp-trading`, score 2.0). | Columns match code. No schema change in C1/C2. |
| 4 | eligibility: index-presence/crawler-hit captured? | ✅ index-presence **ALREADY LIVE** via presence-tier query → `computeIndexPresence` (`geo-digest.ts:207`). **gemini currently BLOCKED (0/3); chatgpt/claude/perplexity 3/3.** ❌ crawler-hit logs: `/var/log/caddy` **EMPTY**, 0 crawler hits in journald, no Caddy access-log directive → **no live `lastCrawlerHit` source**. | **C2 reuses the existing presence-tier `computeIndexPresence`** as the eligibility-gate input (additive, already shows the real gemini block). Crawler-hit deltas = **graceful-empty** (best-effort; AC already allows "graceful on missing log"). See Q4. |
| 5 | objective numbers trace to SoT; tiers head/niche/**knowledge** | ❌ `knowledge` tier is FICTIONAL. Real tiers (`landing/Prompt/geo-queries.yaml` v2 SoT + live data): **head (7) / niche (5) / branded (3) / presence (1)**. `geo-gap-list.ts:29` already: `TIER_WEIGHT = {head:1.0, niche:0.6, branded:0.4}`. | `geo-objective.yaml` `revenue_proximity` keys to **head/niche/branded**; `geo-decide.ts` **imports `TIER_WEIGHT`** (single-derivation) rather than re-declaring. See Q2. |
| 6 | telegram via `sendTelegramMessage` (`src/lib/telegram.js`) | ❌ FICTIONAL fn name. Real: **`src/lib/telegram.ts`** exports **`sendDigest(sections[])`** (the digest path) + **`sendAlert(msg, level)`** (the preserved WoW warning). No `sendTelegramMessage`. Env-gated silent no-op if token/chat unset (no `getMe` needed). | C3 appends to the `buildDigest` lines → `sendDigest` (existing path). No new sender. |
| 7 | cron Mon 08:00; wave adds no cron | ✅ root crontab on Hetzner: `0 8 * * 1 docker exec crypto-quant-signal-mcp-mcp-server-1 node dist/scripts/geo-weekly-cron.js`. No in-container cron, no systemd timer. | Wave **extends the script**; no cron change. |
| 8 | look-alike watch (digest "new trusted domains" substring) | ✅ Confirmed bug + already-shipped fix: `INVESTIGATE-LOOKALIKE-DOMAINS-W1` (`2d0576d`) replaced `domain.includes('algovault')` with **exported `isOwnHost()`** (`algovault.com`+`*.algovault.com` only, spoof-safe). **21 of 28 `algovault`-attributed cites are FROZEN pre-fix look-alikes** (`algovault.io`×9, `www.algovaultstrategies.com`×5, `newsletter.algovaultai.com`×4, `algovaults.com`×3); `www.algovault.com`×3 IS ours. status.md: *"the `suspect_lookalike` bucket is DEFERRED to GEO-AUTOPILOT-W1 C2; `isOwnHost` is exported for C2 to reuse."* | **C2 `getLookalikeWatch` imports `isOwnHost`** (no re-impl). Flags cited domains matching `/algovault/i` where `!isOwnHost(host)` as SUSPECT. `www.algovault.com` → OURS (isOwnHost true). |
| 9 | identifier diff (yaml keys ↔ decide ↔ tests ↔ digest ↔ map) | covered in §3 + §5 | — |
| 10 | psql `-h 204.168.185.24 -U algovault` | ⚠️ Postgres is **loopback-only** (`127.0.0.1:5432`, compose). Direct host psql will refuse. | Use `docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance`. |

### C1 yaml feasibility (the #1 blocker) — RESOLVED ✅
- Loader idiom: `import * as yaml from 'js-yaml'` (**js-yaml ^4.1.0**, `@types/js-yaml ^4.0.9`); `yaml.load(fs.readFileSync(path.resolve(__dirname,'..','..','landing','Prompt','<file>'),'utf-8'))`. `geo-decide.ts` reuses this exact pattern.
- `dist/lib/*` → `__dirname=/app/dist/lib` → `../../landing/Prompt/` = **`/app/landing/Prompt/`** (exists in container ✓).
- **`Dockerfile:45 COPY landing/Prompt/ ./landing/Prompt/`** (Stage 2) bakes the whole dir → `geo-objective.yaml` rides it with **NO Dockerfile/compose change**. `mcp-server` is `build: .` (image-baked, no bind-mount). Deploy = git-pull + image rebuild (`deploy-direct.sh`).
- Build: `tsc`; test: `vitest run` (^3.1.1). Geo test baseline at `2d0576d` = **92/92 green**. `dist/` + `node_modules` present.

---

## 3. Pre-resolved drift corrections (inline-fixable — ratify, don't decide)

| Spec said | Use instead | Why |
|---|---|---|
| repo `/Users/tank/crypto-quant-signal-mcp` | **`/Users/tank/code/crypto-quant-signal-mcp`**, worktree off `origin/main 2d0576d` | stale v1.18.2 vs canonical v1.20.1 + has `isOwnHost` |
| `sendTelegramMessage` / `telegram.js` | **`sendDigest`** (+`sendAlert`) / `telegram.ts` | real exports |
| tables `geo_citations` / `geo_sources` | **`geo_source_citations`** | real W2 table |
| revenue_proximity tier `knowledge` | **`branded`** (head/niche/branded) | real SoT taxonomy; mirror existing `TIER_WEIGHT` |
| C2 re-impl host-match | **import `isOwnHost`** from `geo-extractor.ts` | already shipped + spoof-tested (single-derivation) |
| `psql -h 204.168.185.24` | **`docker exec …postgres-1 psql`** | PG loopback-only |

---

## 4. Architect-decision questions (GENUINE — need your call)

**Q1 (topology — the real design call).** The cron runs **in-container**; the container cannot write the vault's `Prompt/` (the W2 design made **Postgres the cross-host boundary** for exactly this — see `geo-gap-list.ts` header). So "scorer writes `Prompt/geo-decision-<date>.md`" can't happen from the cron as written. **Recommended:** the cron persists the scored decision + rendered brief markdown to Postgres (extend `geo_content_gaps` with a `decision_brief TEXT` col, or a new `geo_decisions` table) and the dashboard renders it; the digest carries the one-move summary + dashboard link; the vault `Prompt/geo-decision-<date>.md` is **materialized by Cowork** as step 1 of the Decide ritual (reads the dashboard/DB). `geo-decide.ts` stays pure (`renderDecisionBrief()→string`); C1 unit test writes to a tmp path. Confirm this, or specify an alternative (bind-mount / host-side scorer step).

**Q2 (objective weights — you asked to approve).** See §6. Core question: `revenue_proximity = {head:1.0, niche:0.6, branded:0.4}` ranks **branded LOWEST** — consistent with the live `TIER_WEIGHT` + GEO-goals "head>niche", on the reading that *head = highest buyer search-volume*. But "branded" queries are where we're **most differentiated** (composite/agent-API/verifiable). Keep volume-weighting, or lift branded? And confirm `score = expected_lift × revenue_proximity × automatability ÷ effort`, evaluated **within the top unlocked tier only**.

**Q3 (digest handoff wording — you asked to approve).** See §5.

**Q4 (C2 eligibility input).** Reuse the **existing presence-tier `computeIndexPresence`** as the gate input (additive; already shows gemini blocked; $0; no new dependency) — **recommended** — vs add a NEW per-engine `site:` HTTP probe (a *second* index-presence derivation + external dependency + the empty-crawler-log issue). Recommend: reuse + add look-alike watch; treat crawler-hit deltas as graceful-empty/best-effort until access-logging exists.

**Q5 (ratify §3 + §0).** Confirm canonical repo `code/`, worktree off `2d0576d`, and the 6 drift corrections.

---

## 5. Copy-tone preview — digest handoff block (for approval, Q3)

Appended after the existing W4 sections, sent via `sendDigest` (rides the existing digest; **no `send_telegram.sh`; no execution/completion TG**). Leads with eligibility when blocked. **Live current-state example (gemini IS blocked today):**

```
🎯 DECISION READY — open Cowork to act
Priority: ELIGIBILITY (gate 1/3)
Move: gemini can't retrieve algovault.com — 0/3 index-presence (Google substrate). Fix the re-crawl before any authority work.
Brief: geo-decision-2026-06-22  ·  1 of 3 candidates scored through the priority gate
→ In Cowork: "write the GEO action from this week's brief" → research → approve → dispatch to Code
Full numbers ↗ https://api.algovault.com/admin/geo-dashboard?key=<admin-key>
```

**Eligibility-clear example (then third-party leads):**
```
🎯 DECISION READY — open Cowork to act
Priority: THIRD-PARTY (gate 2/3)
Move: altfins leads "best-mcp-trading" (head) via altfins.com — pursue a placement/listicle on that surface.
Brief: geo-decision-<date>  ·  N candidates scored
→ In Cowork: "write the GEO action from this week's brief" → research → approve → dispatch to Code
Full numbers ↗ https://api.algovault.com/admin/geo-dashboard?key=<admin-key>
```

> Brief reference shown as a name (not a container-written file) per Q1; dashboard renders the full scored brief.

---

## 6. Objective weights — `geo-objective.yaml` core (for approval, Q2)

```yaml
version: 1
# Goal ladder: REFERENCES to GEO-goals-and-autopilot.md stage targets (NOT hardcoded live numbers).
goal_ladder:
  source: GEO-goals-and-autopilot.md   # §1 ladder (2026 / 2027 / 2028)
  live_metrics_from: /api/performance-public   # never hand-copied
priority_gate: [eligibility, third_party, owned_content]   # HARD order; a blocked engine outranks ALL else
revenue_proximity:        # keyed to the REAL tiers (geo-queries.yaml); mirrors geo-gap-list TIER_WEIGHT
  head: 1.0
  niche: 0.6
  branded: 0.4
score_formula: "expected_lift * revenue_proximity * automatability / effort"   # within top unlocked tier ONLY
action_types:
  eligibility:   { tier: 1, channel: deterministic_or_operator, automatability: 0.9, effort: 0.3 }
  third_party:   { tier: 2, channel: draft_for_operator,        automatability: 0.4, effort: 0.6 }
  owned_content: { tier: 3, channel: cowork_authored_code_wave, automatability: 0.7, effort: 1.0 }
# correlation note (GEO-goals §3): third_party r≈0.66 >> owned r≈0.19 — gate enforces, weights don't fight it
```
No hardcoded live numbers (weights/version only) — passes the C1 AC grep.

---

## 7. Post-approval execution plan (NOT started)
1. `scripts/cc-session.sh new geo-autopilot-w1` off `origin/main 2d0576d`; assert worktree has `isOwnHost` + 92/92 geo tests green.
2. **C1** `landing/Prompt/geo-objective.yaml` + `src/lib/geo-decide.ts` (pure; imports `TIER_WEIGHT`; `js-yaml` loader idiom) → CH1_GREEN gate.
3. **C2** `src/lib/geo-eligibility.ts` (reuse `computeIndexPresence` + `isOwnHost`; crawler-hit graceful-empty) → CH2_GREEN gate.
4. **C3** extend `geo-digest.ts`/`geo-weekly-cron.ts` (per Q1 resolution) + persist brief to Postgres + `docs/GEO-DECIDE-RITUAL.md` + tests + `system-map.md` (4 edges) → CH3_GREEN; deploy-direct → in-container `--dry-run` grep `DECISION READY`.
5. status.md newest-first + WIS `### From GEO-AUTOPILOT-W1`. No version bump.
