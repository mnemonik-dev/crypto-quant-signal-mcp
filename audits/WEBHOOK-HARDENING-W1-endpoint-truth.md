# WEBHOOK-HARDENING-W1 — Plan-Mode endpoint-truth audit (C1)

- **Wave:** WEBHOOK-HARDENING-W1 (Tier-2 Bulk-Spec, PRE-LIVE) — 3 deliverables that must land before `WEBHOOK_DELIVERY_ENABLED=true`: (C2) SSRF egress allowlist, (C3) `/verify?hash=` handler, (C4) host-side delivery-health canary.
- **Date:** 2026-05-29
- **Probed against:** `origin/main` @ `e1de368` (deploy SoT, `v1.18.2`)
- **Verdict:** ✅ **CH1_GREEN pending architect ratification** of: SSRF test-seam, https-only, `/verify` serving approach (R1/R2), canary read-grant, IP-pin defer.

---

## 0. BASELINE (re-derived from origin/main, NOT the vault mirror)

Per the prior wave's lesson (vault mirror was 181 behind): worked from the canonical clone `~/code/crypto-quant-signal-mcp`. At Step 0 it was **1 behind** origin/main (`dc3d6b6` vs `e1de368`); the new commit `e1de368` (track-token install snippets) touched **none** of this wave's target files (webhook-*/verify/performance-db/index.ts/license — confirmed via `git diff --name-only`). Fast-forwarded to `e1de368`; working tree == origin/main, clean. All anchors below grepped from this tree.

---

## 1. system-map.md edges

| # | Edge | Change |
|---|------|--------|
| 1 | Harden existing `SIGNAL → subscriber URLs` outbound edge | + egress allowlist (SSRF guard) at registration + `/test` + delivery. No new edge. |
| 2 | `LANDING /verify` consumer | + `?hash=` lookup path reading `signals` by `signal_hash` (+ `merkle_batch_id`/`merkle_proof`). |
| 3 | NEW monitoring edge | `algovault-monitoring` cron reads `webhook_deliveries` → `send_telegram.sh` → Telegram (CRITICAL_PERSISTENT only). **Wrapper consumer count 5→6.** |
| 4 | UNCHANGED | no new MCP tool; `server.json`/`tools/list`/manifests untouched → no version bump, no publish. |

---

## 2. Endpoint-truth table (claim | reality | resolution)

| # | Claim | Reality on `origin/main` @ e1de368 | Resolution |
|---|---|---|---|
| 1 | egress: `postWithTimeout` does `fetchImpl(sub.url,…)` no validation, default redirect-follow | `webhook-delivery.ts:156` `postWithTimeout`; `:166` `fetchImpl(url,{method,headers,body,signal})` — **no `redirect` option (defaults to follow)** | C2(c): add `redirect:'error'` @ :166 |
| 2 | called from `deliverOne` retry loop | `deliverOne` @ `:178`; `getSubscription` @ `:186`; retry loop `for(let i…)` @ `:233` | C2(b): `await resolveAndAssertEgress(sub.url)` BEFORE the loop (after the `sub`/quota checks, before payload build) |
| 3 | `isValidWebhookUrl` only proto+≤2048 | `webhook-api.ts:53` `function isValidWebhookUrl(url)` → `new URL` + protocol `http:`/`https:` + `≤2048` | C2(a): replace body with `assertEgressAllowed` (try/catch → 400 `invalid_url` + `suggested_action`) |
| 4 | `/test` → `deliverOne` directly | `webhook-api.ts:188` `POST /api/webhooks/:id/test`; `:230` `await deliverOne(deliveryRow)` | covered transitively by C2(b) |
| 5 | `/verify` is a server route (src/index.ts or route module) | **NO `app.get('/verify')`.** `/verify` falls through Caddy's `handle { … try_files … file_server }` → serves static `landing/verify.html` (synced to `/var/www/algovault/` on deploy). `landing/verify.html` JS reads `?id`/`?signalId` → calls `/api/verify-signal`. | **spec-vs-reality gap → ratify R1/R2 (§4)** |
| 6 | `/api/verify-signal` resolution | `src/index.ts:1472` `app.get('/api/verify-signal')` — **integer `signalId` only** (`parseInt`, 400 if NaN) → `getSignalWithBatch` → on-chain proof JSON. Proxied to app via Caddy `handle /api/verify-signal`. | extend to accept `?hash=` (R2) |
| 7 | public allow-list formatter exists | `performance-db.ts:1845` `formatPublicRecentSignal()` (+ `formatRecentCallRow` :1890) — public-only shape, no Phase-E keys. `getSignalByHash()` already returns public-safe cols (id, coin, signal, confidence, timeframe, price_at_signal, created_at, signal_hash, merkle_batch_id, merkle_proof + merkle join) — **NO `outcome_*`/`pfe_*`/`mae_*`/`return_pct_*`** | reuse `getSignalByHash` + a public verify formatter |
| 8 | signals cols `signal_hash VARCHAR(66)`, `merkle_batch_id INTEGER`, `merkle_proof JSONB` | `performance-db.ts:157/158/159` — exact match | ✓ |
| 9 | `send_telegram.sh` wrapper (sha + DRY_RUN) | `/opt/algovault-monitoring/send_telegram.sh` sha256 `938d6b6f7104a8c1802c506d11c4cabefb0d9e392d13743a487530cc305169c5`; `DRY_RUN_TG` gate (L116-120), `CRITICAL_PERSISTENT` severity gate (L78), `STATE_DIR=/opt/algovault-monitoring/.alert-state`; `.alert-state/` empty | C4 consumes verbatim (6th consumer) |
| 10 | crontab off-`:00` slot | dense crontab (5-min families cover every minute mod-5; 3-min `2-59/3`; many 15-min offset families). `:00` is the snapshot-collision boundary to avoid. | C4: pick off-`:00` e.g. `13,28,43,58` (15-min) or `17,47` (30-min) — co-fire with a 5-min family is harmless (cheap COUNT read); just NOT `:00` |
| 11 | canary reads `webhook_deliveries` | **`algovault_autopilot` role → `permission denied for table webhook_deliveries`** (read-only role's `SELECT ON ALL TABLES` grant predates the new table; no `ALTER DEFAULT PRIVILEGES`) | C4 setup: one-time SSH `GRANT SELECT ON webhook_deliveries, webhook_subscriptions TO algovault_autopilot` (consistent with the role's read-only charter — SELECT only, no DDL/DML) |
| 12 | deploy syncs Caddyfile? | **NO.** `deploy.yml` syncs `landing/*.html → /var/www/algovault/` (L99) only; `/etc/caddy/Caddyfile` is manual (`systemctl reload caddy`). | informs R1 vs R2 (§4) |
| 13 | W1 test seam | `webhook-api.test.ts` uses a REAL `http://127.0.0.1:<port>` sink (loopback + http); `webhook-delivery.test.ts` uses a MOCK `fetchImpl` with non-resolving hostnames (`sink`, `sink.example.com`) | guard would block both (loopback IP block + DNS-fail) → **test seam required (§3)** |

**Fictional-primitive count: 0** — every primitive exists; the only gap is the `/verify` serving-architecture assumption (§4), resolved by ratification. ≥3-mismatch HALT not triggered (anchors current on origin/main).

---

## 3. RATIFY — SSRF test-seam + injectable resolver

The 39 W1 tests would break under a naive guard (loopback block + real DNS on fake hostnames). Proposed seam:

- **`WEBHOOK_SSRF_ALLOW_LOOPBACK`** (default **off**). When **on**: permit loopback IPs (`127.0.0.0/8`, `::1`) **and** allow the `http:` scheme **for loopback only** (the W1 local sink is `http://127.0.0.1`). Everything else still validated. Default **off** in prod: https-only + all internal IP classes blocked.
- **Injectable resolver:** `resolveAndAssertEgress(url, { lookup?, allowLoopback? })`; `deliverOne` accepts `deps.lookup` (default `dns.promises.lookup`). This lets (a) the W1 delivery tests inject a benign public-IP `lookup` for their mock-fetch fake hostnames (keeps them hermetic, no real DNS), and (b) the **rebind test** inject a private-IP `lookup` for `evil.example.com`.
- W1 test adjustments (keeping them green, NOT breaking): set `WEBHOOK_SSRF_ALLOW_LOOPBACK=1` in the W1 api/delivery suites' env; pass `lookup` in the delivery suite's `deps`. These are in-scope test-maintenance edits.

## RATIFY — https-only in prod

**Recommend: require `https:` (reject `http:`)** except loopback-under-seam. Subscriber endpoints are public internet URLs; plaintext webhook delivery leaks the signed payload + invites MITM. `http` permitted ONLY when `WEBHOOK_SSRF_ALLOW_LOOPBACK=1` and host is loopback (tests).

## RATIFY — `/verify` serving approach (the one real fork)

`/verify` is **static** (Caddy file_server), not a server route, and the Caddyfile is **not auto-deployed**. Two ways to make `verify_url=…/verify?hash=<hash>` resolve:

- **R2 (RECOMMENDED — no Caddy/cross-host change):** add `?hash=` to the **`/api/verify-signal`** server route (already proxied; resolve via `getSignalByHash`; 404 on unknown; public-only via formatter) **+** add `?hash=` reading to `landing/verify.html` JS (functional handler, Map-Anchor item-4 pre-approved; deploys via the existing `landing/*.html` sync). Click flow: page loads → JS reads `?hash=` → calls `/api/verify-signal?hash=` → renders proof. **Gate verified against `curl /api/verify-signal?hash=<known|unknown>`** (proof / 404 / forbidden-grep=0) + page-wiring assertion. Smaller surface, atomic deploy, preserves existing `/verify` exactly.
- **R1 (literal gate, but heavier):** add `handle /verify { reverse_proxy localhost:3000 }` to the Caddyfile (manual SSH + `systemctl reload caddy` — deploy won't apply it) + `app.get('/verify')` that server-handles `?hash=` and serves the static page otherwise. Satisfies `curl /verify?hash=` 404-on-unknown literally, but adds a cross-host manual step + repo-Caddyfile↔live drift risk + re-routes the existing page through the app.

## RATIFY — C2 optional IP-pin (resolve→connect rebind window)

**Recommend: DEFER.** `resolveAndAssertEgress` (resolve-all + block every A/AAAA) + `redirect:'error'` closes the dominant SSRF + rebind-via-redirect vectors. The residual resolve→connect TOCTOU window (attacker flips DNS between our check and `fetch`'s own resolution) requires an `undici` custom `connect`/`lookup` to pin the validated IP — more surface. File **`OPS-WEBHOOK-SSRF-IP-PIN-W1`** follow-up; accept the small residual window for the dark-launch.

---

## 4. Identifier diff (R↔AC) — consistent

`WEBHOOK_SSRF_ALLOW_LOOPBACK` · `assertEgressAllowed` · `resolveAndAssertEgress` · `EgressBlockedError(code,reason)` · IP block classes (127/8, ::1, 169.254/16, fe80::/10, 10/8, 172.16/12, 192.168/16, fc00::/7, 100.64/10, 0.0.0.0/::) · `redirect:'error'` · canary `OPS-WEBHOOK-DELIVERY-<CLASS>-W{NEXT}` template · 400 `invalid_url` / delivery `dead` — all internally consistent across Scope/Gate/Map sections. `signal_hash` kept (existing identifier); public fields stay calls-not-signals.

---

## CH1_GREEN

Anchors re-derived from `origin/main` @ e1de368; greenfield-of-gaps confirmed (0 fictional primitives). Awaiting architect ratification of: SSRF test-seam (§3), https-only (§3), `/verify` R2-vs-R1 (§3), canary read-grant (§2 #11), IP-pin defer (§3). On approval → C2.
