# DOCS-INTEGRATION-H2-W1 — Step 0 Plan Mode Baseline Audit (2026-05-18)

**Wave:** `DOCS-INTEGRATION-H2-W1` (BUNDLED Part A docs.html restructure + Part B URL-IA fix)
**Tier:** 1 Standard · Plan Mode REQUIRED (risk marker 4 + public-IA mutation across ≥6 surfaces)
**Code's checkout (probed):** `/Users/tank/crypto-quant-signal-mcp/` ✓ (vault-nested copy at `experiments/crypto-quant-signal/crypto-quant-signal-mcp/` is Cowork-only)
**Branch:** `main` · **Working tree:** clean (1 untracked audit JSON from prior wave; not in scope)
**Verdict:** 🛑 **HALT-CLASS** — ≥3 fictional spec primitives (version state has moved past spec's baseline assumption). Surfacing Cowork Q-block at end of this doc; **NOT executing R2–R8 until architect ratifies an updated path forward**.

---

## A. Part A endpoint-truth probes (docs.html restructure)

| Spec primitive | Probe command | Reality | Resolution |
|---|---|---|---|
| Code's git-checkout path | `find $HOME -maxdepth 3 -type d -name 'crypto-quant-signal-mcp'` | `/Users/tank/crypto-quant-signal-mcp` ✓ | PASS-PINNED |
| `src/lib/mcp-usage-docs.ts` exports `MCP_USAGE_HTML` | `grep -n 'export const MCP_USAGE_HTML' src/lib/mcp-usage-docs.ts` | line **19** | PASS-PINNED |
| `scripts/build_landing.mjs` rebuilds docs.html | `grep -n 'MCP_USAGE_HTML' scripts/build_landing.mjs` | lines 7, 31, 80, 84 — pipeline confirmed: imports from `dist/lib/mcp-usage-docs.js`, populates `BUILD:mcp-usage:start/:end` markers | PASS-PINNED |
| Current `package.json` version | `jq -r '.version' package.json` | **`1.15.0`** | **🛑 SPEC EXPECTED `1.14.1`** — see §D HALT |
| `landing/docs.html` BUILD markers | `grep -n 'BUILD:mcp-usage' landing/docs.html` | start=line **920**, end=line **1094** (block size = 174 lines) | PASS-PINNED |
| algovault-skills tutorials present | `ls /Users/tank/git/algovault-skills/docs/integrations/{langchain,llamaindex,maf,crewai}.md` | all 4 present | PASS — Code reads at R2 |
| Live `algovault.com/docs.html` reachable | `curl -sS -o /dev/null -w "%{http_code}" https://algovault.com/docs.html` | **200** | PASS |
| `#connect-mcp` anchor consumers | `grep -rE '#connect-mcp\|id="connect-mcp"' landing/ src/` | 2 hits: `landing/docs.html` (the section itself), `src/lib/mcp-usage-docs.ts` (source) — **no external deep-link consumers found in-repo** | PASS — keep `id="connect-mcp"` on demoted H3 anyway (deep-link integrity for any external referrer not in-repo) |

---

## B. Part B endpoint-truth probes (URL-IA fix)

| Spec primitive | Probe command | Reality | Resolution |
|---|---|---|---|
| Route mechanism — Express or Caddy? | `grep -nE "/docs/integrations" src/index.ts` + `cat Caddyfile` | **Hybrid (Path 3): Caddy `handle /docs/integrations/*` reverse-proxies to `localhost:3000`; Express `app.get('/docs/integrations/:exchange', ...)` serves from `INTEGRATION_HTML` Map** | Both files must change — see §C disambiguation |
| Express route handler | `grep -n "app.get.*integrations" src/index.ts` | line **838**: `app.get('/docs/integrations/:exchange', ...)` (param renamed from `:exchange` to `:exchange` despite frameworks added — naming is historical) | MOVE to `/integrations/:slug` + ADD 301 redirect handler at old path |
| `INTEGRATION_EXCHANGES` allow-list | line 819 | `['binance', 'okx', 'bybit', 'bitget']` ✓ | preserve verbatim |
| `INTEGRATION_FRAMEWORKS` allow-list | line 824 | `['langchain', 'llamaindex', 'maf', 'crewai']` ✓ | preserve verbatim |
| Caddyfile current rule | `grep -nE 'docs/integrations\|integrations' Caddyfile` | lines 56-58: `handle /docs/integrations/* { reverse_proxy localhost:3000 }`; line 64: `handle /skills`; line 70: `handle /integrations` (index page only, NO wildcard) | ADD new `handle /integrations/* { reverse_proxy localhost:3000 }` BEFORE existing `handle /integrations` (Caddy matches most-specific first; wildcard must come BEFORE bare match — verify); KEEP `handle /docs/integrations/*` to deliver the 301 from Express |
| Live serve test (4 exchanges, OLD path) | `curl -sI` × 4 | all **200** ✓ | baseline confirmed |
| Live serve test (4 frameworks, OLD path) | `curl -sI` × 4 | all **200** ✓ | baseline confirmed |
| Target path currently empty | `curl -sI /integrations/<slug>` × 8 | all **404** ✓ | confirms move is a real change (not already-aliased) |
| Render script output paths | `ls landing/integrations/` | 8 `.html` files: `binance,okx,bybit,bitget,langchain,llamaindex,maf,crewai` | NO CHANGE — file paths stay correct |
| `landing/<slug>.html` canonical/og:url/JSON-LD URLs | `grep -nE 'canonical\|og:url\|"url":' landing/integrations/<slug>.html` | 8 files × 3 hits each = **24 hardcoded references to old path** inside the served HTMLs themselves | R5 cross-link sweep MUST cover the per-tutorial HTML internals OR regenerate via `scripts/render-integrations.mjs` after updating its base-URL constant (TBD which path the render script uses) |

### Cross-link inventory (in-repo)

`grep -rEn 'docs/integrations/(binance\|okx\|bybit\|bitget\|langchain\|llamaindex\|maf\|crewai)' --include='*.md' --include='*.html' --include='*.ts' --include='*.js' --include='*.mjs' --include='*.json' --exclude-dir=node_modules --exclude-dir=dist .`

| File | Hits | Disposition |
|---|---|---|
| `README.md` | 8 (lines 91-94 frameworks, 306-309 exchanges) | **REWRITE** (R5) — switch all 8 `algovault.com/docs/integrations/<slug>` → `algovault.com/integrations/<slug>` |
| `CHANGELOG.md` | 4 (lines 59-62, historical 1.14.0 entry) | **LEAVE** (historical-record discipline; spec excepts CHANGELOG) |
| `landing/integrations.html` (index page) | 8 (JSON-LD `"url"` × 4 + card `href` × 4) | **REWRITE** (R5) |
| `landing/integrations/<slug>.html` × 8 | 3 each (canonical + og:url + JSON-LD url) = **24 total** | **REWRITE** — regenerate via render script if it accepts a base-URL flag; else direct edit + commit per-file diff |
| `tests/unit/knowledge-index.test.ts` | 2 (lines 65, 130 — `langchain` fixture URL) | **REWRITE** (R5) |
| `docs/PLAUSIBLE_EVENTS.md` | 1 (analytics docs example with old href) | **REWRITE** (R5) |

**Live in-repo total (excl. CHANGELOG):** 51 hits across 12 files.

### Cross-link inventory (vault-side)

| File | Class | Disposition |
|---|---|---|
| `NPM-readme.md` | LIVE (Cowork's staging copy) | Per spec R5 line 299: **Cowork ALREADY updated** 2026-05-18 — Code verifies zero `docs/integrations/` remain, does NOT re-edit |
| `XPost.md` | LIVE (drafts) | LEAVE — historical past entries; spec defers to Cowork |
| `ToDoList.md` | LIVE | informational; spec doesn't require update |
| `dev.to/v1.14.0-framework-integrations-draft.md` | LIVE | Cowork updates pre-Tuesday cron (per spec) |
| `experiments/crypto-quant-signal/crypto-quant-signal-mcp/README.md` | **STALE COPY** | not authoritative; LIVE README is `/Users/tank/crypto-quant-signal-mcp/README.md` |
| `experiments/crypto-quant-signal/crypto-quant-signal-mcp/docs/PLAUSIBLE_EVENTS.md` | STALE COPY | not authoritative |
| `Prompt/*.md` × 9 hits | HISTORICAL (per `feedback_ask_before_restructuring.md`) | LEAVE intact |
| `status.md` (vault root) | HISTORICAL (4 hits) | LEAVE intact — 301 covers backward compatibility |

---

## C. Caddy ↔ Express disambiguation (Path 3 — Hybrid)

**Current serving stack** (probed `Caddyfile` lines 56-58 + `src/index.ts:809-846`):

```
algovault.com/docs/integrations/<slug>
  ↓
Caddy `handle /docs/integrations/*` → reverse_proxy localhost:3000
  ↓
Express `app.get('/docs/integrations/:exchange', ...)`
  ↓ Map.get(slug)
INTEGRATION_HTML (pre-loaded at startup from landing/integrations/<slug>.html)
```

**Recommended R4 change set** (Path 3 implementation):

1. **Express (`src/index.ts:838`)** — rename the route to `/integrations/:slug` (also rename `req.params.exchange` → `req.params.slug` for accuracy now that 4 frameworks live alongside 4 exchanges) AND add a sibling 301 redirect handler:
   ```ts
   app.get('/integrations/:slug', (req, res) => { ... existing body ... });
   app.get('/docs/integrations/:slug', (req, res) => {
     res.redirect(301, `/integrations/${req.params.slug}`);
   });
   ```
2. **Caddyfile** — add `handle /integrations/* { reverse_proxy localhost:3000 }` BEFORE the existing `handle /integrations` (Caddy `handle` blocks match most-specific-first; the bare `/integrations` block currently handles the index page only and would conflict with the wildcard if ordering is wrong — needs live verification). Keep `handle /docs/integrations/*` so Express's 301 reaches the client (otherwise Caddy would serve a `file_server` 404 from the static catch-all).

**No file move on disk** — `landing/integrations/<slug>.html` stays at the same path.

---

## D. Identifier diff — 🛑 HALT-class mismatches

| Identifier | Spec value | Live probe | Diff? |
|---|---|---|---|
| `package.json` version | `1.14.1` | **`1.15.0`** | 🛑 **YES** |
| `server.json` version | `1.14.1` | **`1.15.0`** | 🛑 **YES** |
| `landing/manifest.json` exists | implicit YES (spec's R6 list "MUST NOT touch") | **MISSING** — `ls landing/manifest.json` → no such file | 🛑 **YES** |
| `CHANGELOG.md` top entry | `## [1.14.1]` | **`## [1.15.0] - 2026-05-18 — AV-CHAT-MCP-W1`** (already shipped per `8faad20 1.15.0` commit) | 🛑 **YES** — v1.15.0 is the bundling target the spec calls "future wave" but it has already happened |
| Live npm latest | implicit `1.14.0` baseline | `npm view crypto-quant-signal-mcp version` → **`1.14.0`** | informational — both `1.14.1` and `1.15.0` in-repo are bumped but **not yet published** (registry will jump 1.14.0 → 1.15.0 on next publish; `1.14.1` will never appear on the npm registry as a standalone release) |
| Bump target (per dispatch approval string) | `SKIP — deferred to v1.15.0` | v1.15.0 has already shipped in-repo | 🛑 **YES** — deferral target preempted |
| In-repo `README.md` "What's new" | should be at `v1.14.0/v1.14.1` baseline (spec R6) | **`## What's new in v1.15.0`** (line 100) | 🛑 **YES** — README has been rewritten by AV-CHAT-MCP-W1 |
| Recent commits | spec assumes branch state = post-`AI-AGENT-FRAMEWORK-TUTORIALS-W1` (v1.14.0) + `KNOWLEDGE-ARTIFACT-W1` (v1.14.1) | `git log --oneline -15` shows 15 commits past v1.14.0 — including `8faad20 1.15.0`, `9395fc9 chore(release): v1.15.0 companion-manifest sync`, `99cf8d3 v1.15.0 release notes`, plus DESIGN-W11-FF-CARD-BG + CHAT-USAGE-ANALYTICS-W1 follow-ups | 🛑 **YES** — 2 unrelated waves (AV-CHAT-MCP-W1 + CHAT-USAGE-ANALYTICS-W1 + DESIGN-W11-FF) shipped between this prompt's authoring time and now |
| Framework names (4) | `LangChain`, `LlamaIndex`, `Microsoft Agent Framework`, `CrewAI` | match (per AI-AGENT-FRAMEWORK-TUTORIALS-W1 ship + algovault-skills tutorial files) | n/a |
| 8 slug values | `binance,okx,bybit,bitget,langchain,llamaindex,maf,crewai` | match `INTEGRATION_EXCHANGES ∪ INTEGRATION_FRAMEWORKS` in `src/index.ts:819,824` | n/a |
| Old URL pattern returns 200 | `algovault.com/docs/integrations/<slug>` × 8 | all 200 ✓ | n/a |
| New URL pattern currently empty | `algovault.com/integrations/<slug>` × 8 | all 404 ✓ | n/a |

**Fictional / out-of-date spec primitives: 6** (well over the ≥3 HALT threshold per CLAUDE.md Plan Mode rules).

---

## E. HALT triage — paths forward

Per CLAUDE.md Plan Mode rule: "If ≥3 spec primitives are fictional, HALT and propose paths." Per `feedback_halt_class_prepare_cowork_questions.md`: "write a copy-paste Q-block for user to take to Cowork; do NOT ExitPlanMode unilaterally."

### E.0 Critical reframing — RELEASE-CADENCE-GOVERNANCE-W1 (read AFTER first draft of this audit)

Status.md 2026-05-18 22:30 UTC entry `RELEASE-CADENCE-GOVERNANCE-W1` (which shipped TODAY, after this prompt was authored) establishes canonical governance:

> **Code (every Tier 1 + Tier 2 wave from now on)**: do NOT touch `package.json` / `server.json` / `manifest.json` / `lobehub-manifest.json` versions; do NOT add `## [X.Y.Z]` headings to `CHANGELOG.md`; do NOT run `mcp-publisher publish` or open version-tagged Discussions or draft X-threads. Append to status.md as today. Append WIS as today.

This **collapses the 6 fictional primitives into a single root cause**: the spec's version-baseline literals (`1.14.1`) are stale, but the spec's INTENT (R6 "DEFERRED — no bump, no marketing artifacts this wave") is now canonical governance — not an architect-specific one-off deferral. The "future v1.15.0 wave" bundling target is structurally replaced by "the next daily release wave (whatever bump that ends up being)".

Under the new governance, **the only spec change needed is renumbering the version-baseline literals from `1.14.1` to `1.15.0`** (in R7's gate) and dropping the "v1.15.0 future wave" wording in favor of "the next daily release wave per RELEASE-CADENCE-GOVERNANCE-W1". The substantive Part A + Part B work is unaffected.

### E.1 Substantive observations

- Part A (docs.html restructure) and Part B (URL-IA move + 301 redirects) are mechanically independent of the version question — the code work can land regardless of what the bump strategy becomes.
- All 6 "fictional primitives" in §D share one root cause (v1.15.0 has shipped in-repo since the prompt was authored).
- R7's verification gate's `package.json = 1.14.1` literal needs to become `package.json = 1.15.0` (1-line change in the audit gate).
- Spec's "README stays at v1.14.0/v1.14.1 baseline" is moot — README is already past that, but Code does NOT touch it this wave anyway (per governance).
- `landing/manifest.json` mention in R6 was always a spec typo (landing's manifest is `landing/integrations.html`'s manifest-driven generation, not a `landing/manifest.json` file at that path; the real version manifests are `package.json` + `server.json` + the lobehub root-level `manifest.json`). Spec intent is clear: do NOT touch ANY version manifests.

### E.2 Options for architect

| Path | Action | Compatible with RELEASE-CADENCE-GOVERNANCE-W1? |
|---|---|---|
| **A — Execute Part A + Part B; NO bump (rebase R7 gate on v1.15.0)** | Run R2-R5 (docs.html restructure + URL move + 301 redirects + cross-link sweep). Do NOT touch `package.json` / `server.json` / `CHANGELOG.md` / in-repo `README.md` (per governance + spec R6 intent). R7 gate's version assertion changes from `= 1.14.1` to `= 1.15.0`. Next daily release wave will pick up these changes from status.md accumulator + bundle into bump + marketing. **Code's recommended path.** | ✅ Fully aligned |
| **B — Patch bump v1.15.0 → v1.15.1 this wave** | Adopt v1.15.1 as the version for the Part A + Part B substantive ship. New `## [1.15.1]` CHANGELOG entry. `package.json` + `server.json` + lobehub manifest + DXT manifest move to 1.15.1. Marketing artifacts ship. Mr.1 completes mcp-publisher device-flow if JWT expired. | ❌ Violates governance (code-landing wave bumping version) — would need explicit `RELEASE-CADENCE-GOVERNANCE-W1` override from Mr.1 |
| **C — Minor bump v1.15.0 → v1.16.0 this wave** | Same as Option B but minor bump (Part B is a public URL-IA surface change — arguably a contract mutation). | ❌ Same governance violation as B |
| **D — Cowork rewrite** | Hand the spec back to Cowork with this audit attached; Cowork rewrites baseline-on-current-state. | ✅ But adds round-trip latency — Path A captures the same correctness in this session |

**Code's recommended path: A** — substantive Part A + Part B work lands now; version bump + marketing artifacts are picked up by the next daily release wave (per RELEASE-CADENCE-GOVERNANCE-W1). Code amends R7's version assertion from `1.14.1` to `1.15.0` (the only literal change needed in the gate). Status.md entry under R8 follows the new governance shape (no version-touch summary; just substantive-changes summary that Cowork can fold into the next release-wave dispatch).

---

## F. Copy-paste Cowork Q-block

```
DOCS-INTEGRATION-H2-W1 Plan-Mode HALT (1 root cause, 6 surface primitives, 2026-05-18)

Code's R1 probes found the in-repo state has moved past the spec's
v1.14.1 baseline assumption. ALL 6 fictional primitives share ONE root
cause: v1.15.0 has shipped in-repo since this prompt was authored
(AV-CHAT-MCP-W1 + companion-manifest sync + CHAT-USAGE-ANALYTICS-W1
layered on top — 15 commits past the prompt's implied baseline).

  1. package.json = 1.15.0 (spec assumed 1.14.1)
  2. server.json  = 1.15.0 (spec assumed 1.14.1)
  3. landing/manifest.json — MISSING (spec R6 cites it; no such file
     exists at landing/ — likely a spec-author typo for the lobehub
     root-level manifest.json or the implicit landing/integrations.html
     manifest-driven generation)
  4. CHANGELOG.md top entry = "## [1.15.0] - 2026-05-18 — AV-CHAT-MCP-W1"
     (commits 8faad20 "1.15.0" + 9395fc9 v1.15.0 companion-sync +
     99cf8d3 v1.15.0 release notes have shipped; the spec's "v1.15.0
     future wave" bundling target has been preempted)
  5. In-repo README.md "What's new in v1.15.0" (line 100); spec R6
     says "README stays at v1.14.0/v1.14.1 baseline" — already past
  6. R7 verification gate hardcodes package.json = 1.14.1 — will fail
     unconditionally; needs to become 1.15.0

CRITICAL REFRAMING — RELEASE-CADENCE-GOVERNANCE-W1 (shipped 2026-05-18
22:30 UTC, AFTER this prompt was authored) makes the spec's R6 intent
("no bump, no marketing, no publish in this wave") the new CANONICAL
governance rule for ALL Tier-1/Tier-2 code waves. The "deferred to
v1.15.0 future wave" wording is structurally replaced by "deferred to
the next daily release wave (whatever bump that ends up being)".

Substantive task (Part A docs.html restructure + Part B
/docs/integrations → /integrations URL move + 301 redirects) is
mechanically unaffected. Probes confirm:
  • 4 framework tutorials at /Users/tank/git/algovault-skills/docs/
    integrations/{langchain,llamaindex,maf,crewai}.md all present
  • 8 OLD URLs all return 200; 8 NEW URLs all return 404 (move is a
    real change, not already-aliased)
  • Caddy/Express path is hybrid (Path 3 — Caddy handle
    /docs/integrations/* reverse-proxies to Express
    app.get('/docs/integrations/:exchange') at src/index.ts:838);
    both files need editing
  • 51 in-repo cross-link hits across 12 files (CHANGELOG excluded);
    24 of these are canonical/og:url/JSON-LD inside the 8 per-tutorial
    landing/integrations/<slug>.html files — preferred fix is
    regenerate via scripts/render-integrations.mjs after locating its
    base-URL constant

Architect paths:

  A) Execute Part A + Part B substantive work, NO bump, R7 gate
     amended (1.14.1 → 1.15.0 baseline). Next daily release wave
     bundles per RELEASE-CADENCE-GOVERNANCE-W1. ✅ Aligns with new
     governance. CODE RECOMMENDS.
  B) Patch bump 1.15.0 → 1.15.1 this wave + ship marketing artifacts.
     ❌ Violates governance — would need explicit override.
  C) Minor bump 1.15.0 → 1.16.0 this wave + marketing.
     ❌ Same governance violation.
  D) Cowork rewrite spec baseline.
     ✅ But Path A captures correctness without round-trip.

Approval string (pick one):

  Path A (RECOMMENDED):
    DOCS-INTEGRATION-H2-W1 Plan Mode APPROVED. Version bump: SKIP
    (baseline rebased to v1.15.0 per RELEASE-CADENCE-GOVERNANCE-W1;
    next daily release wave bundles). Part B scope confirmed: move
    all 8 (4 exchanges + 4 frameworks) /docs/integrations/<slug>
    → /integrations/<slug> with 301 redirects. Proceed R2.

  Path B:
    DOCS-INTEGRATION-H2-W1 Plan Mode APPROVED. Version bump: 1.15.0
    → 1.15.1 + ship marketing artifacts (RELEASE-CADENCE-GOVERNANCE
    -W1 OVERRIDE explicitly authorized). Proceed R2.

  Path C:
    DOCS-INTEGRATION-H2-W1 Plan Mode APPROVED. Version bump: 1.15.0
    → 1.16.0 + ship marketing artifacts (RELEASE-CADENCE-GOVERNANCE
    -W1 OVERRIDE explicitly authorized). Proceed R2.

  Path D:
    Returning spec to Cowork for rewrite.

Plan-Mode baseline audit:
/Users/tank/crypto-quant-signal-mcp/audits/docs-integration-h2-w1-baseline
-2026-05-18.md
```

---

## G. Audit-time state snapshot

- `git status -s` → `?? audits/tool-desc-audit-w1-postdeploy-tools-list-2026-05-17.json` (unrelated untracked file from a prior wave; not in scope for this wave)
- `git branch --show-current` → `main`
- `git log --oneline -15` (most recent first):
  ```
  b8f5f4a fix(design): DESIGN-W11-FF-CARD-BG / part 3 — recent-table bg override
  ba03d43 fix(chat-analytics): re-apply src/index.ts wiring lost to parallel-session contamination
  7cc9135 fix(design): DESIGN-W11-FF-CARD-BG / part 2 — JS render-style edits
  fe9a9f3 feat(chat-analytics): instrument chat_knowledge + /api/chat with PII-safe event analytics
  da29cea Revert "fix(design): DESIGN-W11-FF-CARD-BG ..."
  6e1e0d4 fix(design): DESIGN-W11-FF-CARD-BG — unify 5 element card bg
  9395fc9 chore(release): v1.15.0 companion-manifest sync (Registry + LobeHub v4→v5 + DXT v1.7.0→v1.8.0)
  7d22097 chore(audit): disk cleanup execution 2026-05-18
  89bce95 chore(lobehub): bump manifest v3 → v4 + add search_knowledge + chat_knowledge entries
  8faad20 1.15.0
  99cf8d3 test(knowledge): unit + integration tests + v1.15.0 release notes
  955a2ab feat(knowledge): chat_knowledge MCP tool (C3 of AV-CHAT-MCP-W1)
  3236fd0 feat(knowledge): search_knowledge MCP tool + /api/search HTTP endpoint
  1dfdceb feat(knowledge): BM25 search engine + index builder + result cache
  81a3bbc chore(funnel): auto-snapshot 2026-05-18
  ```
- `system-map.md` vault-level `Last touched` (line 3) = `CHAT-USAGE-ANALYTICS-W1` (2026-05-18)
- `system-map.md` crypto-quant-signal-mcp card `Last-touched wave` (line 90) = `KNOWLEDGE-ARTIFACT-W1` (2026-05-18) — **drift inside system-map.md itself**, side-finding only (not in scope to fix here; flag in WIS)
- npm live latest = `1.14.0`; in-repo `package.json` + `server.json` both at `1.15.0`; npm registry will jump 1.14.0 → 1.15.0 on next `npm publish` (v1.14.1 was tagged but never published as a standalone npm release)

---

## H. R2-R8 readiness (post-approval)

When architect ratifies a path, the following plan stands:

- **R2** — restructure `src/lib/mcp-usage-docs.ts`: wrap existing `<section id="connect-mcp">` in NEW outer `<section id="integration">` + NEW H2 "Integration"; demote existing H2 to H3 (keeping `id="connect-mcp"`); add NEW H3 `<section id="connect-ai-agent">` with 4-row framework table + 4 `<details>` walkthroughs sourced from `/Users/tank/git/algovault-skills/docs/integrations/{langchain,llamaindex,maf,crewai}.md`. All tutorial links use NEW `/integrations/<slug>` path.
- **R3** — `cd /Users/tank/crypto-quant-signal-mcp && npm run build && npm run build:landing` (probe `package.json` `scripts` for exact build:landing target name).
- **R4** — Express + Caddyfile edits per §C. Plan-Mode probe noted Caddyfile `handle /integrations` (line 70) is the index page route — must verify Caddy block-ordering before adding wildcard `handle /integrations/*`.
- **R5** — 51-hit cross-link sweep across 12 files (README.md, landing/integrations.html, 8 × landing/integrations/<slug>.html canonical/og:url/JSON-LD, tests/unit/knowledge-index.test.ts, docs/PLAUSIBLE_EVENTS.md). Per-tutorial HTMLs (canonical etc.) — preferred path is to regenerate via `scripts/render-integrations.mjs` after locating its base-URL constant; fallback is per-file direct edit.
- **R6** — NO-OP per dispatch (or amended per architect path B/C).
- **R7** — gate adjusted: `package.json = <ratified version>` (1.15.0 for Path A; 1.15.1 for Path B; 1.16.0 for Path C). All other Part A + Part B assertions unchanged.
- **R8** — status.md + `system-map.md updated: Y` (Part B is a producer/consumer edge mutation — landing URL contract changes from `/docs/integrations/<slug>` to `/integrations/<slug>` with 301 fallback) + WIS append.

---

**End of baseline audit.** Awaiting architect ratification before R2 dispatch.
