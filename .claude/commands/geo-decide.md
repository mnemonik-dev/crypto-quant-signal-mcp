---
description: Read this week's GEO decision brief and start the Cowork Decide ritual
---

Run the GEO Decide review now (manual trigger; the canonical schedule is the Mon 08:00 UTC cron).

1. Read the latest scored decision from Postgres (the cross-host boundary):
   ```
   ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
     "docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance \
      -c \"SELECT created_at, priority_tier, status, chosen_move FROM geo_decisions ORDER BY created_at DESC LIMIT 1\" \
      -c \"SELECT rendered_brief FROM geo_decisions ORDER BY created_at DESC LIMIT 1\""
   ```
   (or open the dashboard: https://api.algovault.com/admin/geo-dashboard?key=<admin-key> → "🎯 This week's decision").

2. Materialize the brief into the vault as `Prompt/geo-decision-<date>.md`.

3. Deep-research the top candidate per the priority gate: why the leader wins it, the concrete
   move, expected lift, target engine, which sub-goal (A/B/C). Author the Tier-1/2 action spec.

4. Hand to Mr.1 to approve → dispatch to Code (`/goal`-gated) → completion to `status.md` only
   (NO Telegram). Flip `geo_decisions.status` proposed → approved → executed → measured.

Full runbook: `docs/GEO-DECIDE-RITUAL.md`. Tuning SoT: `landing/Prompt/geo-objective.yaml`.
