# LANDING-EYEBROW-LIVEBIND-W1 — endpoint-truth (thin Plan-Mode gate)

**Worktree:** `/Users/tank/code/cqsm-wt-landing-dual-render-parity` @ `origin/main 54fc226` (branch `landing-eyebrow-livebind-w1`, clean at gate time).
**Probed:** 2026-06-25, live worktree (HEAD = the W1 commit this builds on). Read-only.
**Outcome:** thin gate PASSES — no blocking NEW drift. 1 trivial inline fix (canary test (c), part of Req 4). Proceed.

## 1. Eyebrow DOM at HEAD (exact — both twins)
- `…background:var(--accent, var(--cyan))"></span><span data-av-copy="hero.eyebrow.desktop">Model Context Protocol server · 5 venues monitored</span></div>`
- `…</span><span data-av-copy="hero.eyebrow.mobile">MCP server · 5 venues monitored</span></div>`
→ split each into `prefix-span(data-av-copy=hero.eyebrow_prefix.<v>)` + `<span data-tr-field="exchange_count">5</span>` + snapshot comment + `suffix-span(data-av-copy=hero.eyebrow_suffix.<v>)`.

## 2. `exchange_count` hydration — pair discipline SATISFIED (`landing/js/track-record-proxy.js`)
- `:107 function setField(name, value)` → `:109 querySelectorAll('[data-tr-field="' + name + '"]')` sets `textContent` on **ALL** matching nodes.
- `:147 setField('exchange_count', formatRawInt(perf && perf.exchange_count))`; `:288` "refresh() … updates ALL data-tr-field"; load + a 3s polling refresh.
- `:24` comment "exchange_count → '5' (raw integer; auto-updates when 6th adapter lands)".
→ My new eyebrow `<span data-tr-field="exchange_count">5</span>` is **auto-hydrated by the existing loop** (adding a span for an already-hydrated key). `5` ships as the snapshot fallback. **No proxy change.** (Category (b): API-fetched w/ refresh.)

## 3. Injector write semantics — innerHTML (W1 `inject-landing-copy.mjs`)
- W1 SoT values include `<br/>` (`hero.subhead`) and shipped GREEN → the injector replaces inner CONTENT verbatim. Prefix/suffix are plain text → trivially handled. The count span + comment sit BETWEEN the prefix and suffix `data-av-copy` nodes (not inside either) → injector never touches them.

## 4. `design_w7` Q-W7-4 — counts `<tspan>` only
- `:114` regex `<tspan[^>]*data-tr-field="exchange_count"`; live `<tspan>` count = **4** (≥2). Eyebrow adds `<span>` (not `<tspan>`) → Q-W7-4 stays green.

## 5. No contiguous-eyebrow-string assertion anywhere
- `grep -rnE "venues monitored|Model Context Protocol server|MCP server ·" tests/` → **EMPTY**. `design_w4`/`design_w7` reference only the `lp-hero-mobile` WRAPPER class, not the eyebrow text → splitting the eyebrow breaks nothing.

## 6. The 1 inline fix (flagged, not a HALT)
- W1 canary `tests/unit/landing-dual-render-parity.test.mjs` test **(c)** `:93-94` hardcodes `data-av-copy="hero.eyebrow.{desktop,mobile}"`. After the key split those markers are renamed → test (c) would red. **Update test (c)** to assert `hero.eyebrow_prefix` + `hero.eyebrow_suffix` coverage (the spec's "no canary change expected" was an optimistic prediction; reality = a 1-assertion rename, which IS Req 4 "canary green with the new keys"). Tests (a)/(b)/(d)/(e) are generic and auto-cover the new keys.

## 7. Identifier diff (R ↔ AC ↔ Plan) — no mismatch
- new: `scripts/landing-drift-scan.mjs`, `audits/LANDING-DUAL-RENDER-PARITY-DRIFTSCAN-2026-06-25.md`; SoT keys `hero.eyebrow_prefix` / `hero.eyebrow_suffix`; bind `data-tr-field="exchange_count"`. Consistent across Req 1/2/5 + AC. ✓
- **Fictional primitives: 0.** Thin gate PASSES → execute A (Reqs 1-4) + B (Req 5).
