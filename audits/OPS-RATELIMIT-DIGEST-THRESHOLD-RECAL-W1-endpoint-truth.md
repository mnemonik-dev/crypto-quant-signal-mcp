# OPS-RATELIMIT-DIGEST-THRESHOLD-RECAL-W1 — endpoint-truth (Plan-Mode, light)

**Date:** 2026-06-07
**Verdict:** ✅ **READY — 0 fictional primitives.** The recal I flagged last wave, now confirmed against live telemetry. No blocking architect-confirm; the design-confirm RESOLVED to throw-only (probed), + one small message-wording choice + one AC2-timing nuance surfaced. Spec says "wait for architect" → presenting, then C1.

Risk markers: trigger-logic change keyed on live telemetry distribution; non-GHA deploy. Light Plan-Mode.

---

## Step 0 — system-map edge-touch

NO new edge. **Trigger-LOGIC change on the existing `shadow-digest-weekly → rate_limit_events` read-edge**: the HL self-watch trigger becomes denial-only (interactive throws), dropping the by-design batch-wait disjunct. `system-map.md updated: Y` (brief annotation — both digest triggers now uniformly denial-based; no new edge/component, `tools/list`=9, no response-shape change).

---

## Live probes (the recal is data-driven, per the spec)

| Probe | Result | Implication |
|---|---|---|
| HL interactive throws — noise floor vs the `25/7d` threshold | **7d-all = 32890** (real PRE-fix throws); **since backfill-fix 14:40 = 0** (spanning 2 deploys + their cold-starts) | the post-fix steady-state + cold-start noise floor is **~0** → the `25/7d` threshold is comfortably above it; **keep 25** (no empirical raise needed) |
| HL batch-wait p95 (the disjunct being removed) | **179s** live | by-design (batch waits up to ~5min to yield the interactive reserve) — confirmed false-positive; remove |
| **design-confirm:** HL batch SKIP (sustained = starvation?) | 7d = 5681 (PRE-fix historical) but **since-fix = 3** (transient) | skips were a SYMPTOM of the pre-fix saturation, now resolved → **NOT sustained starvation** → ship throw-only; **document "waits & skips are by-design batch behavior; only interactive throws are operator-actionable"; NO starvation-signal follow-up** (spec default) |
| shadow-budget trigger (R2: confirm throw-based) | line 154 `v.throws >= SHADOW_THROW_TRIGGER(3)` — throw-based, no batch-wait condition | ✅ already denial-based; confirm, do NOT change |
| `.hlWebsocket` consumers | tests only (5 assertions); `buildRateLimitSection` uses `.lines` only | rename safe |
| clean-baseline | HEAD `e950a18`, no tracked mods | clear |

---

## Plan (the coherent recal — all within trigger-logic; firewall'd section rendering untouched)

`src/scripts/shadow-digest-weekly.ts`:
1. **Drop the disjunct** (R1 core): `hlInteractive >= HL_INTERACTIVE_THROW_TRIGGER || hlWaitP95Ms > HL_WAIT_P95_TRIGGER_MS` → `hlInteractive >= HL_INTERACTIVE_THROW_TRIGGER`. Keep the `25` threshold (probe-confirmed above the ~0 noise floor).
2. **Remove `HL_WAIT_P95_TRIGGER_MS`** (now dead).
3. **Rename `hlWebsocket` → `hlDenial`** (the websocket wave is cancelled; the spec's generator principle is "denial-based" — coherence; contained to the return type + 5 test assertions).
4. **Remove the now-unused `hlWaitP95Ms` PARAM** from `evaluateRateLimitTriggers(perVenue)`; update the `buildRateLimitSection` call (line 236). `buildRateLimitSection` still COMPUTES `hlWaitP95Ms` for the section's "HL batch-wait p95: Xs" summary line (untouched — firewall'd rendering); it just stops passing it to the trigger.
5. **Message** — keep the redirected driver-agnostic ACTION; drop the by-design p95 from the metrics prefix: `⚠️ HL: ${hlInteractive} interactive throws/7d — Action: investigate the HL interactive driver via the per-caller breakdown above (attribute first; do NOT prescribe a structural wave blind)`.
6. Update the comment block (the recal is DONE here — not "deferred").

`tests/unit/rate-limit-events.test.ts` (R3): drop the 2nd arg from all `evaluateRateLimitTriggers` calls; `.hlWebsocket`→`.hlDenial`; **the key R3 cases** — `batch-wait p95 179s + 0 interactive throws → SILENT` (false-positive gone), `interactive throws ≥ 25 → FIRES` with the driver-agnostic action; shadow trigger unaffected. `tests/unit/shadow-digest-rate-limit.test.ts` already asserts the redirected action (tidyup) — re-confirm green.

---

## Two things to surface

**(1) Small message-wording choice (R1 "keep the redirected action line").** I read that as keep the ACTION (`Action: investigate…`, which I keep verbatim) and drop the by-design `batch-wait p95 Xs` from the METRICS prefix — because a denial alert that still prints "batch-wait p95 179s" re-introduces the exact "the waits look alarming" confusion the recal removes. If you'd rather keep the message byte-identical (p95 shown as context), say so and I keep the param + the p95 in the message (Option X — minimal, slightly less coherent). **Recommend: drop the p95 from the alert** (alert = actionable signal only).

**(2) AC2-timing nuance (not a blocker).** AC2 wants the live `--dry-run` SILENT, but the 7d window currently holds the **32890 real pre-fix interactive throws** → the throw disjunct correctly FIRES today (a real historical event, not a false-positive). So AC2 is demonstrated as: the **unit test** proves `179s wait + 0 throws → silent` (the false-positive elimination, synthetic + rigorous); the **live dry-run** fires on the 32890 real throws (the throw disjunct working = the AC2 "forced-throw canary" satisfied by live data) with the driver-agnostic action and NO p95-trigger; **live-silent arrives in ~7d** as the pre-fix throws age out (post-fix = 0). I'll record this in status.md.

---

## Gates (on "proceed")

`grep` proves no batch-wait/p95 disjunct in the HL trigger (AC1); both triggers denial-based. Unit tests (AC2 false-positive-gone + real-signal-fires). Clean `rm -rf dist && npm run build`; full suite +0 new failures. deploy-direct `--verify-only` GREEN, `tools/list`=9, no version bump. Live dry-run shows throw-only firing (no p95 disjunct). status.md + `system-map.md: Y` + WIS (the design-confirm conclusion: batch waits/skips by-design, throw-only; NO starvation follow-up).
