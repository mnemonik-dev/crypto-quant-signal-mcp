# RUNBOOK — carry-ranker re-rank flip (scan_funding_arb ordering)

_EDGE-CARRY-SERVING-W1 shipped the machinery DARK. This runbook is the ONE-LINE flip a separate
Mr.1 dispatch executes after divergence review. Scope inherited from `CARRY_RANKER_PASS_TA`:
**re-ranking (selection) only — no performance-claim language of any kind, internal or public.**_

## What flips

`scan_funding_arb` result ordering switches from the composite `rankScore` sort to: carry-scored
items first (model score desc; W2: scored ONLY via allowlisted-venue legs), unscored items after
(legacy order). Response SHAPE, fields, quotas, pricing, tool description: UNCHANGED. Fail-open:
scores stale (>3h) / table missing / any read error → legacy order automatically. Every non-empty
scan writes a durable `carry_divergence_log` row (fire-and-forget) regardless of flags — the flip
evidence survives deploys.

## Pre-flip bar (pre-registered — mechanical, replaces discretionary review) — EDGE-CARRY-SERVING-W2

The flip is NO LONGER a judgement call. A venue is **eligible** ⇔ its **live-forward** paired diff
(ranker − naive `portfolio_net_carry_x2`, one point per interval-venue) clears ALL of:

- **CI-lb > 0** — block bootstrap over ISO-week clusters (the gate's own method), AND
- **n ≥ 50 deviating** interval-venues live-forward — per-venue: that venue's OWN deviating count;
  pooled: the TOTAL deviating count (CI on the per-UTC-day summed series, ISO-week blocks), AND
- **scorer 7-day health clean** (no unexplained staleness), AND
- **≥ 3 ISO-week clusters** accrued — below that → `insufficient_week_clusters`, an anti-garbage-CI
  floor (block bootstrap on 1 cluster is degenerate); NOT a sufficiency claim.

**Per-venue flip** ⇔ that venue clears the bar → allow it via `CARRY_RANKER_VENUES` (below).
**Global flip** ⇔ the POOLED cell clears the bar.

Computed by the ONE canonical derivation (`readiness.py`, single-derivation LAW — the 5× rank-
replication trap dies there). Print current state vs bar any time; also surfaced weekly (one line)
in the Monday AOE health-check status.md entry:

```bash
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 'cd /opt/algovault-carry && PYTHONPATH=/opt/algovault-carry/pkg /opt/algovault-carry/.venv/bin/python -m src.research.carry.readiness --check'
```

**Bar changes require a NEW wave + Mr.1 ratification — no in-flight edits.**

**FDR-passing venue candidates** (EDGE-CARRY-RANKER-W1 holdout gate, BH-FDR q=0.05): **HL, BYBIT**
(+ POOLED). BINANCE, ASTER, KUCOIN did NOT clear FDR. **BYBIT caveat:** it passed FDR (p=0.017) but
its holdout CI-lb = 0.0 (not > 0); the live bar keys on CI-lb > 0, so BYBIT stays WAIT until it
clears CI-lb live-forward. Expected today: **all WAIT** (HL closest — CI-lb > 0 but n=47 < 50, only
2 ISO weeks).

- [ ] Target venue(s) read **READY** in `readiness.py --check` (not WAIT / NO-DEVIATIONS).
- [ ] Explicit Mr.1 ack recorded in status.md (public-behavior change = explicit permission, per LAW).

## Flip (THREE-key ignition: SOURCE ∧ ENABLED ∧ venue ∈ CARRY_RANKER_VENUES)

`CARRY_RANKER_VENUES` is a comma list of the exchangeIds that cleared the bar (e.g. `HL`, or
`HL,BYBIT`); empty/unset ⇒ the re-rank applies to NO coin. A coin re-ranks ONLY when it quotes an
allowlisted venue leg with a fresh score.

```bash
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24
cd /opt/crypto-quant-signal-mcp
printf 'CARRY_RANKER_SOURCE=postgres\nCARRY_RANKER_ENABLED=true\nCARRY_RANKER_VENUES=HL\n' >> .env   # set VENUES to the READY venues ONLY — verify the compose env_file in use first
docker compose up -d mcp-server        # up -d, NOT restart (restart does not reload env_file)
docker exec crypto-quant-signal-mcp-mcp-server-1 env | grep CARRY_RANKER    # ALL THREE present
```

Verify: run a low-threshold scan (`minSpreadBps: 0.01`) and confirm the divergence line
`[carry-divergence] {... "applied": true, "venue_scope": "HL", "n_allowlist_scored": N ...}` and the
durable row in `carry_divergence_log`.

## Rollback (instant)

Remove/comment all three lines from the env file (or drop just `CARRY_RANKER_VENUES` → the re-rank
applies to no coin — a partial, per-venue rollback lever) → `docker compose up -d mcp-server` →
verify `applied: false` in the next divergence line (stdout AND `carry_divergence_log`). No data
migration, no schema change — ordering reverts to legacy immediately. (Reader failure modes fail-open
to legacy even while flipped.)

## Retrained-artifact archival (release lane note)

Weekly retrains that PASS the rolling Tier-A gate swap `current.json` on 204 and log to
`/opt/algovault-carry/carry_ranker_reports.duckdb` (204-local; there is NO automated 204→178
path). When a release wave bundles this, scp the promoted `carry-ranker-vN.{json,joblib.gz}`
from `/opt/algovault-carry/artifact/` into the AOE repo `src/research/carry/artifacts/` for
provenance.

## Pre-flagged release-note DRAFT (next release wave; Mr.1 approves wording separately)

> **Classification: EXTERNAL** (user-visible ordering change once flipped). Not shipped until the
> flip is live. No performance-claim language permitted.

```markdown
### scan_funding_arb — smarter result ordering
Results are now ordered by AlgoVault's funding-persistence model (retrained weekly against its
own quality gate), so the spreads most likely to persist surface first. Same response shape,
same fields, same pricing — ordering only. Set `minSpreadBps` as before to control the universe.
```
