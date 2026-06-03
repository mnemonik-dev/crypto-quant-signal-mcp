# AI-CRAWLER-ACCESS-W1 — Part A Read-Only Audit

**Date:** 2026-06-03 (UTC) · **Repo:** `crypto-quant-signal-mcp` @ `5196cf7` (== origin/main, clean baseline) · **Auditor:** Code (single session, Plan-Mode audit-gate)
**Scope:** R1 (read-only forensic). Zero mutations to the public surface or remediated code. Two read-only artifacts produced: this report + `AI-CRAWLER-ACCESS-W1-endpoint-truth.md`.

## VERDICT: 🛑 HALT — remediation paused for operator decision

R1 surfaced **3 operator/infra-level surprises** that the spec's code-edit remediation (edit `landing/robots.txt`) **cannot** resolve, because the headline blocker lives at the **Cloudflare edge**, not in the committed file. Per the wave instruction (*"if R1 surfaces a major surprise, STOP and report before remediating"*) → halt and report. The **safe** code parts (sitemap refresh, IndexNow, presence probe) are unaffected and ready to ship on your go-ahead.

---

## R1 item-by-item: PASS / FIX

### R1.1 — robots.txt citation allow-list — ⚠️ MIXED (committed PASS; live FIX requires Cloudflare)

**Live-vs-committed diff:** the live `robots.txt` (216 lines) is the committed `landing/robots.txt` (156 lines, allow-all) **with a 60-line Cloudflare "Managed content" block prepended at the edge.** The committed file contains none of it (Caddy serves it verbatim; Cloudflare injects the block above).

**Cloudflare-injected block (NOT in repo, NOT removable by editing the repo):**
```
# BEGIN Cloudflare Managed content
User-agent: *
Content-Signal: search=yes,ai-train=no
Allow: /
User-agent: Amazonbot           Disallow: /
User-agent: Applebot-Extended   Disallow: /
User-agent: Bytespider          Disallow: /
User-agent: CCBot               Disallow: /
User-agent: ClaudeBot           Disallow: /
User-agent: CloudflareBrowserRenderingCrawler  Disallow: /
User-agent: Google-Extended     Disallow: /
User-agent: GPTBot              Disallow: /
User-agent: meta-externalagent  Disallow: /
# END Cloudflare Managed Content
```

**Per-citation-bot directive on the LIVE file:**

| Bot | Role | Committed (AV block) | Cloudflare block | Effective | Verdict |
|---|---|---|---|---|---|
| `OAI-SearchBot` | ChatGPT search (citation) | `Allow:/` | — | Allow | ✅ PASS |
| `ChatGPT-User` | ChatGPT on-demand fetch | `Allow:/` | — | Allow | ✅ PASS |
| `Claude-SearchBot` | Claude search (citation) | `Allow:/` | — | Allow | ✅ PASS |
| `Claude-User` | Claude on-demand fetch | `Allow:/` | — | Allow | ✅ PASS |
| `PerplexityBot` | Perplexity (citation) | `Allow:/` | — | Allow | ✅ PASS |
| `Perplexity-User` | Perplexity fetch | `Allow:/` | — | Allow | ✅ PASS |
| `Googlebot` | Search + AI Overviews | `Allow:/` | — | Allow | ✅ PASS |
| **`Google-Extended`** | **Gemini grounding (citation)** | `Allow:/` | **`Disallow:/`** | **conflicting** | 🛑 **FIX** |
| `GPTBot` | OpenAI training | `Allow:/` | `Disallow:/` | conflicting | 🛑 FIX (training; acq-first) |
| `ClaudeBot` | Anthropic training | `Allow:/` | `Disallow:/` | conflicting | 🛑 FIX (training; acq-first) |
| `CCBot` | Common Crawl (training) | `Allow:/` | `Disallow:/` | conflicting | 🟡 FIX (training) |

**Precedence note (factual):** `Google-Extended` (and GPTBot/ClaudeBot) now match **two** `User-agent` groups. Google's RFC-9309 parser merges duplicate groups and, for an equal-length `Allow:/` vs `Disallow:/` tie, applies the **least-restrictive** rule → **Allow** wins. So Gemini grounding *likely* still resolves as allowed in practice. **But:** (a) other engines' parsers may differ, (b) the global **`Content-Signal: ai-train=no`** is an unambiguous, machine-readable *"do not train"* declaration that **contradicts the acquisition-first North Star** (R2.1: *"blocking training bots does not help citations and forfeits future-model recall"*), and (c) the spec's R1.1 says *"FIX if Google-Extended is Disallow'd"* — and it **is** Disallow'd in one group.

**Dead bots (`Claude-Web`/`anthropic-ai`):** ✅ PASS — **no directive** exists for either; the only match is an explanatory **comment** (committed ~line 78) stating they were removed as deprecated.
> ⚠️ **Verification-gate bug:** the spec's gate `! curl … | grep -qiE 'Claude-Web|anthropic-ai'` will **falsely FAIL** because the comment text contains those strings. The gate needs a `#`-comment strip before the forbidden-phrase grep. (Same class as skill `html-comment-strip-before-forbidden-phrase-grep`.)

**Train-vs-cite policy (recorded):** committed file = **allow-all** (acquisition-first); Cloudflare overlay = **search=yes, ai-train=no** + training-bot blocks. The two are in direct conflict; the Cloudflare overlay is the one buyers' tools actually see at the edge.

**R1.1 resolution:** 🛑 **FIX requires the Cloudflare dashboard** (AI Audit → Managed robots.txt / "Block AI bots" / Content Signals Policy). **Cannot be remediated in this repo.** Operator decision required (see Decision Block).

---

### R1.2 — sitemap.xml freshness — 🟢 FIX (safe, committed-file)

Live `sitemap.xml` == committed (12 URLs, has `<lastmod>`). Cross-check vs **live-200** public pages:

- **Currently listed (12):** `/`, `/docs.html`, `/integrations`, `/integrations/{binance,bitget,bybit,okx}`, `/llms.txt`, `/llms-full.txt`, `/skills`, `/track-record`, `/verify`.
- **Missing (exist + 200, should ADD):** `/faq`, `/glossary`, `/how-it-works`, `/privacy`, `/terms`, and 9 integration subpages `/integrations/{claude-code,claude-desktop,cline,crewai,cursor,langchain,llamaindex,maf,smithery}`.
- **Must NOT add (404):** `/pricing`, `/integrations/hyperliquid` — *the spec's expected page-set wrongly included `/pricing`*. Verified 404 live.
- **Canonicalization note:** `/docs` and `/docs.html` both 200; extensionless routes (`/faq` etc.) all 200. Recommend extensionless canonical URLs in the refreshed sitemap to match the homepage's clean-apex canonical style.

**R1.2 resolution:** 🟢 FIX — refresh to the verified live-200 page set + `<lastmod>`. **Safe, unaffected by the surprises**, and *helps* the re-crawl (R1.4).

---

### R1.3 — IndexNow presence — 🟢 FIX (safe, add)

**ABSENT.** No key file in `landing/` (no `^[a-f0-9]{32}\.txt$`), and `grep -rni indexnow` across the repo = ∅ (no ping wiring). As the spec anticipated (April predates it). `deploy.yml:122` `cp landing/*.txt` confirms a new `landing/<key>.txt` will deploy via the existing glob.

**R1.3 resolution:** 🟢 FIX — add key file + fail-open ping. **This is precisely the forced-re-crawl trigger the stale-parking index (R1.4) needs** (Bing/Yandex → ChatGPT/Perplexity substrate; Google ignores IndexNow).

---

### R1.4 — Tri-index presence baseline — 🛑 MAJOR SURPRISE

| Substrate | Engine fed | Baseline finding |
|---|---|---|
| **Google** | Gemini | Indexed, **ROOT-ONLY**, **stale domain-parking snapshot** (*"Get a price in less than 24 hours… domain experts… within 24 business hours"*). No deep pages. |
| **Brave** | Claude | Indexed, **ROOT-ONLY**, **same stale parking snapshot** (independent confirmation). No deep pages. |
| **Bing** | ChatGPT | `site:` = CAPTCHA challenge (unreadable headless). Web-search proxy shows root indexed with the same parking copy. Needs Bing Webmaster confirmation (R4). |

**Two independent engines returned the identical parking copy** → this is a real **stale snapshot from before AlgoVault occupied the domain**, not a summarizer artifact. **Implication:** the baseline is **not** the spec's implied "unindexed" — it is **"indexed-as-stale-parking, root-only."** A citation-allowed bot retrieving `algovault.com` today gets **parking content, not the product** — so a future *"0% mentions"* would read **not "not authoritative" and not "not indexed" but "indexed with the wrong content."** Good news: presence means a forced re-crawl (IndexNow + Search Console / Bing Webmaster "request indexing") can flush it — which is what R2.3 + R4 deliver.

**Bonus surprise — `www.algovault.com` → HTTP 522** (broken proxied subdomain; same Cloudflare IPs as apex, no origin). Apex canonical is clean (`https://algovault.com`, no www refs). Should be `301 www → apex` or the record removed; otherwise old/external links to www 522 and compound the index problem.

**R1.4 resolution:** 🛑 Document + escalate; the re-crawl medicine (R2.3 IndexNow + R4 webmaster submits) is correct but the **reframed success metric** (flush stale parking, not "get indexed") needs operator awareness, and `www` 522 is an operator/Cloudflare fix.

---

### R1.5 — Per-engine index-presence via the 4 live GEO engines — ⏸ DEFERRED (needs container keys)

The 4 GEO engines (`claude-web`→Brave, `chatgpt`→Bing, `gemini`→Google, `perplexity`→own) require the **deployed Hetzner container's API keys**; they cannot run from this local checkout (no keys locally). **Substrate proxy from R1.4** is a strong stand-in: Brave/Bing/Google all return the stale-parking snapshot → `claude`/`chatgpt`/`gemini` would retrieve parking content for a presence query; `perplexity` own-index unknown.

**R1.5 resolution:** ⏸ Run the one-shot live presence probe **as part of R3** on the container (the R3 `presence`-tier query is the exact vehicle). All R3 anchors confirmed present (see endpoint-truth #9). **R3 is a clean, low-risk code addition unaffected by the surprises.**

---

## Summary table

| R1 item | Verdict | Fixable in repo? | Blocked on operator? |
|---|---|---|---|
| 1.1 robots citation allow-list (committed) | ✅ PASS | — | — |
| 1.1 robots — Cloudflare `Google-Extended` Disallow + `ai-train=no` | 🛑 FIX | ❌ no | ✅ **yes (Cloudflare dashboard)** |
| 1.1 dead-bot absence | ✅ PASS (+ gate bug) | n/a | — |
| 1.2 sitemap freshness | 🟢 FIX | ✅ yes | no |
| 1.3 IndexNow | 🟢 FIX | ✅ yes | no |
| 1.4 tri-index baseline (stale parking, root-only) | 🛑 SURPRISE | partial (re-crawl) | ✅ **yes (webmaster request-indexing + R4)** |
| 1.4 www 522 | 🛑 FIX | ❌ no | ✅ **yes (Cloudflare)** |
| 1.5 per-engine presence | ⏸ DEFERRED to R3 | ✅ yes (R3) | no |

---

## DECISION BLOCK — for Mr.1 / Cowork (copy-paste)

> **AI-CRAWLER-ACCESS-W1 audit (Part A) is GREEN-with-3-surprises. Need 3 decisions before remediating:**
>
> **Q1 — Cloudflare Managed robots.txt.** The LIVE `robots.txt` has a Cloudflare-injected block (above our committed allow-all file) that `Disallow:`es `Google-Extended` (Gemini-grounding) + `GPTBot`/`ClaudeBot`/`CCBot`/`Bytespider`/etc. and asserts `Content-Signal: ai-train=no`. This **contradicts the acquisition-first North Star** and is **not editable in the repo** — it's a Cloudflare dashboard setting (AI Audit → Managed robots.txt / "Block AI bots"). **Decision: disable the Cloudflare AI-bot block so the committed allow-all is authoritative? (Recommended: yes — it's the whole point of the wave.)** Who has Cloudflare dashboard access?
>
> **Q2 — Stale parking-page index.** Google + Brave + Bing all index `algovault.com` **root-only with a stale domain-parking snapshot** ("get a price in 24 hours / domain experts"), not our content. So our re-index work isn't "get indexed" — it's "**flush the stale parking snapshot**." That needs Search Console + Bing Webmaster **"request (re)indexing"** on top of IndexNow + sitemap. **Decision: OK to proceed with IndexNow + sitemap now (code wave), and you handle the one-time webmaster property-verify + request-indexing (R4)?**
>
> **Q3 — `www.algovault.com` → 522.** Broken proxied subdomain (apex is fine + canonical). **Decision: add a Cloudflare `301 www → apex` redirect (or delete the www record)?** (Recommended: 301 redirect.)
>
> **Meanwhile, with your go-ahead I will ship the SAFE, unaffected code parts now:** (a) sitemap refresh to the verified live-200 page set, (b) IndexNow key + fail-open ping on deploy, (c) the per-engine index-presence probe add-on (which will *detect* the parking-snapshot problem on every future weekly run). None touch marketing copy.

---
*Read-only audit. No public-surface or code mutations performed. Files written this pass: this report + `AI-CRAWLER-ACCESS-W1-endpoint-truth.md` (both in `audits/`).*
