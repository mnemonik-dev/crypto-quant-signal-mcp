# AI-CRAWLER-ACCESS-W1 — endpoint-truth (Plan-Mode probe)

**Probed:** 2026-06-03 (UTC) · **Repo:** `crypto-quant-signal-mcp` @ `5196cf7` (== origin/main) · **Probe type:** read-only (Part A / R1 gate)
**Verdict:** 🛑 **HALT before remediation** — 3 operator/infra-level surprises that the spec's code-edit remediation path cannot resolve. Safe code parts (sitemap refresh, IndexNow, presence probe) are unaffected and ready, but the headline blocker (citation-bot eligibility) lives at the **Cloudflare edge**, not in the committed file.

## Probe table — `claim | reality | resolution`

| # | Spec claim / anchor | Probed reality | Resolution |
|---|---|---|---|
| 1 | `landing/robots.txt` served via Caddy static catch-all → editing it controls the **live** allow-list | LIVE `robots.txt` (216 lines) = committed file (156 lines, allow-all) **+ a 60-line `# BEGIN Cloudflare Managed content … # END` block PREPENDED at the edge.** Diff confirms the committed file contains **none** of it. Caddy serves the committed file verbatim; **Cloudflare injects the managed block above it.** | 🛑 **MAJOR.** Editing `landing/robots.txt` **cannot** remove the managed block. Fix is in the **Cloudflare dashboard** (AI Audit → "Managed robots.txt" / "Block AI bots" / Content Signals). Operator decision required. |
| 2 | Citation bots all allowed | Committed file: `OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot, ChatGPT-User, Claude-User, Perplexity-User` → cleanly `Allow: /` ✅. **BUT** Cloudflare block `Disallow: /` for **`Google-Extended`** (Gemini-grounding citation substrate — in the spec's FIX set), plus `GPTBot, ClaudeBot, CCBot, Bytespider, Amazonbot, Applebot-Extended, meta-externalagent, CloudflareBrowserRenderingCrawler`; **and a global `Content-Signal: search=yes,ai-train=no`.** | 🛑 **FIX (operator/Cloudflare).** `Google-Extended` now has **two conflicting groups** (CF `Disallow:/` + AV `Allow:/`). Google's own RFC-9309 parser breaks an equal-length Allow/Disallow tie toward **Allow** (least-restrictive), so Gemini grounding *likely* still resolves allowed — but it is parser-dependent and the `ai-train=no` signal **contradicts the acquisition-first North Star** (R2.1). |
| 3 | `Claude-Web` / `anthropic-ai` DEAD → must be absent | **No `User-agent: Claude-Web` / `anthropic-ai` directive exists.** Only an explanatory **comment** (committed line ~78) names them as deprecated. | ✅ **PASS.** ⚠️ Gate bug: the spec's own gate `! curl … \| grep -qiE 'Claude-Web\|anthropic-ai'` **falsely FAILs** on that comment text. Needs a `#`-comment strip before the forbidden-phrase grep (cf. skill `html-comment-strip-before-forbidden-phrase-grep`). |
| 4 | `sitemap.xml` 11 URLs, likely stale | LIVE == committed; **12 URLs**, has `<lastmod>`. Live-200 pages **missing** from it: `/faq /glossary /how-it-works /privacy /terms` + **9 integration subpages** (`claude-code, claude-desktop, cline, crewai, cursor, langchain, llamaindex, maf, smithery`). `/pricing` → **404**, `/integrations/hyperliquid` → **404** (must **NOT** add). `/docs` and `/docs.html` both 200. | 🟢 **FIX (safe, committed-file).** Refresh to current page set + `<lastmod>`. Deploys via existing glob. Unaffected by the surprises. |
| 5 | `deploy.yml` `cp landing/*.txt` + `cp sitemap.xml` ships new files | Confirmed `deploy.yml:122-123`. A new `landing/<indexnow-key>.txt` syncs via the `*.txt` glob; no Caddy reload. | ✅ **PASS.** IndexNow key file will deploy via the existing path. |
| 6 | IndexNow present? | **ABSENT** — no key file in `landing/`, no ping wiring anywhere in repo (`grep -rni indexnow` = ∅). | 🟢 **FIX (safe, add).** This is exactly the re-crawl trigger the stale index (probe #7) needs (Bing/Yandex → ChatGPT/Perplexity substrate). |
| 7 | Tri-index presence baseline (Bing→ChatGPT, Google→Gemini, Brave→Claude) | **Google + Brave + (Bing via web-search) all index `algovault.com` ROOT-ONLY with a STALE DOMAIN-PARKING snapshot** — two independent engines returned the identical *"Get a price in less than 24 hours · one of our domain experts will have a price to you within 24 business hours"* parking copy. No deep pages indexed. Bing `site:` = CAPTCHA challenge (unreadable headless). | 🛑 **MAJOR.** Baseline is **not** "unindexed" — it is **"indexed-as-stale-parking, root-only."** AI engines retrieving `algovault.com` today get **parking content, not the product.** Needs forced re-crawl (IndexNow + Search Console / Bing Webmaster "request indexing"), R4. |
| 8 | (bonus) www subdomain | `www.algovault.com` → **HTTP 522** (Cloudflare origin-timeout; broken). Same Cloudflare IPs as apex but no origin for www. Apex `algovault.com` → 200, canonical/og:url clean apex, **no www refs in homepage HTML**. | 🛑 **FIX (operator/Cloudflare).** Redirect `www → apex` (301) or remove the dangling proxied record. Compounds #7 if any external/old links point at www. |
| 9 | R3 probe anchors (`geo-queries.yaml` tiers, `runWeeklyProbe`, `geo-digest.ts`, `geo-dashboard.ts`, `getRetrievalEngines` 4-engine) | All present. Tiers `head/niche/branded` exist; **`presence` tier absent** (R3.1 to add). `runWeeklyProbe(opts?)` @ `geo-orchestrator.ts:187`. `geo-digest.ts`/`geo-dashboard.ts` exist; **no `index-presence` yet** (R3.3 to add). 4-engine default @ `llm-provider.ts:677`. 8 `geo-*.test.ts` files. | ✅ **PASS — R3 is a clean, low-risk code addition, unaffected by the surprises.** |

## Probe commands (reproducible)
```bash
curl -fsS https://algovault.com/robots.txt           # → CF managed block + committed file
diff landing/robots.txt <(curl -fsS …/robots.txt)    # → 60-line CF prefix only
curl -fsS https://algovault.com/sitemap.xml          # → 12 URLs, stale
for p in /faq /glossary /how-it-works /privacy /terms /pricing /integrations/hyperliquid; do
  curl -s -o /dev/null -w "%{http_code} $p\n" https://algovault.com$p; done   # 200×5, 404, 404
curl -s -o /dev/null -w "%{http_code}\n" https://www.algovault.com/           # → 522
grep -rni indexnow .                                  # → ∅ (absent)
```

## Bottom line
- **Code-side remediation that is SAFE & ready now:** R2.2 sitemap refresh, R2.3 IndexNow key+ping, R3 presence probe. These directly *help* (re-crawl trigger + future ✗-detection) and are unaffected by the surprises.
- **Requires operator/Cloudflare decision BEFORE it can be "fixed" (cannot be edited in the repo):**
  1. **Cloudflare Managed robots.txt** disallowing `Google-Extended` + training bots and asserting `ai-train=no` — contradicts the acquisition-first North Star.
  2. **Stale domain-parking index snapshot** in Google/Bing/Brave (root-only) — the real reason a future "0% citations" would read ambiguous; needs forced re-crawl + webmaster request-indexing.
  3. **`www.algovault.com` 522** — broken proxied subdomain.
- Per the wave's audit-gate instruction (*"if R1 surfaces a major surprise, STOP and report before remediating"*) → **HALT for operator decision.** See `AI-CRAWLER-ACCESS-W1-audit-2026-06-03.md`.
