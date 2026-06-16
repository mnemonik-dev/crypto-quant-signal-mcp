# GEO Decide Ritual — the weekly Detect → Decide → Execute → Measure loop

**Shipped:** GEO-AUTOPILOT-W1 · **Status:** human-gated (the loop never auto-mutates a public surface)

This is the runbook for the closed GEO loop. The **autonomous half** ends at "brief ready";
a human (Mr.1, via Cowork) does the deep-research Decide + approves; Code executes `/goal`-gated.

```
Mon 08:00 UTC ── Detect (auto) ──► scored brief (auto) ──► 🎯 digest handoff (auto)
                                                                   │
                                                    Mr.1 opens Cowork (when he engages)
                                                                   ▼
                                              Decide (Cowork deep-research) ─► Approve (Mr.1)
                                                                   ▼
                                              Execute (Code, /goal-gated) ─► status.md ONLY
                                                                   ▼
                                              Measure (next Monday's attribution loop)
```

## 1. Detect — automatic (Mon 08:00 UTC, in-container cron)

`geo-weekly-cron.ts` runs the 4-engine probe, then `fetchDigestData()`:
- reads `geo_mentions` + `geo_source_citations` (the W2 source-citation map),
- computes per-engine **index presence** (`computeIndexPresence` — the eligibility signal),
- ranks the week's candidate moves through the **hard priority gate** via `geo-decide.ts::scoreWeek`
  (eligibility → third-party → owned-content; weighted by `landing/Prompt/geo-objective.yaml`),
- renders the brief (`renderDecisionBrief`) and **persists one row to `geo_decisions`**
  (`status = 'proposed'`).

The digest (`sendDigest`) carries **one** operator-action block — the scored handoff that
replaces the old naive "ONE MOVE":

```
🎯 DECISION READY — open Cowork to act
Priority: ELIGIBILITY (gate 1/3)  ·  Move: <one-line>
candidate action: Prompt/<drafted-spec>.md (already drafted)   ← when the objective maps the move
Brief: geo-decision-<date> · N candidates scored through the priority gate
→ In Cowork: "write the GEO action from this week's brief" → research → approve → dispatch to Code
Full numbers ↗ https://api.algovault.com/admin/geo-dashboard?key=<admin-key>
```

> **No TG on execution / gate-green / deploy / completion / timeout** (no-TG-on-completion LAW).
> The digest rides the existing in-container `sendDigest`, **not** the host-side `send_telegram.sh`
> operator-action contract (that stays reserved for CRITICAL_PERSISTENT drift).

## 2. Decide — Cowork (Mr.1-triggered, deep research)

The autopilot produced the **brief**, not the action. When Mr.1 engages:

1. Open Cowork. Trigger phrase: **"write the GEO action from this week's brief."**
2. Cowork reads the latest decision. The brief lives in Postgres `geo_decisions.rendered_brief`
   (the cross-host boundary — the in-container cron cannot write the vault). Read it via either:
   - the dashboard: `https://api.algovault.com/admin/geo-dashboard?key=<admin-key>` → "🎯 This week's decision", **or**
   - `docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -c "SELECT rendered_brief FROM geo_decisions ORDER BY created_at DESC LIMIT 1"`.
3. **Materialize** the brief into the vault as `Prompt/geo-decision-<date>.md` (Cowork writes this file
   — step 1 of the ritual).
4. **Deep-research the top candidate:** why the leader wins it (which page/domain is cited, what
   structure/proof), the concrete move, expected lift, target engine, which sub-goal (A/B/C) it
   advances — scored within the highest **unlocked** priority tier only.
5. Author the Tier-1/2 action spec (same pattern as `GEO-CONTENT-spec-input.md` → `GEO-CONTENT-W1`).

## 3. Approve — Mr.1

Approve / edit / veto the Cowork-authored action spec. On approve, flip the ledger row:
`UPDATE geo_decisions SET status='approved' WHERE id=<id>`.

## 4. Execute — Code (`/goal`-gated)

Dispatch the approved spec to Code. Execute under `/goal <verifiable end-state>`
("all pages 200 + canary green"-class). The loop **never auto-mutates a public surface** —
execution is always human-approved. On completion: **status.md ONLY** (no TG). Flip
`status='executed'`.

Routing by move-type (the objective's `action_types`):
- **eligibility** → deterministic re-crawl (IndexNow / sitemap resubmit / Search Console) or an
  operator task. (The Gemini index gap is the separate Tier-1 `fix-gemini-google-index-presence-w1`.)
- **third-party** → DRAFT only → operator queue (awesome-list PR / G2 / listicle / Reddit — never
  auto-post; Reddit auto-posting was spam-flagged).
- **owned-content** → Cowork-authored Tier-1/2 Code spec, `/goal`-gated.

## 5. Measure — next Monday (auto)

Next Monday's probe attribution loop reports whether the move worked (the digest's "DID LAST
WEEK'S MOVE WORK?" section). Flip `status='measured'`. **Quarterly:** GEO KPIs roll into the
G4/G6 gate review.

## Tuning the loop (zero code change)

Everything is data-driven from `landing/Prompt/geo-objective.yaml` (the objective SoT):
- new weight → edit `revenue_proximity` / `action_types`,
- new drafted spec for fast-path → add a `known_action_specs` row,
- the priority gate order is `priority_gate`.

The 15-query set is `landing/Prompt/geo-queries.yaml`. Neither needs a code change to retune.

## The `geo_decisions` ledger

Append-only; one row per weekly run. `status` flips `proposed → approved → executed → measured`
across the loop. `ranked_candidates` (jsonb) holds the scored active-tier candidates;
`rendered_brief` holds the full markdown brief; `gap_ref` loosely links a `geo_content_gaps` row.

## Optional: manual trigger

`.claude/commands/geo-decide.md` is a Claude-Code-side slash-command stub to read the latest
decision on demand (e.g. "run the GEO decide review now"). The canonical schedule is the Monday
cron; this is just a convenience.
