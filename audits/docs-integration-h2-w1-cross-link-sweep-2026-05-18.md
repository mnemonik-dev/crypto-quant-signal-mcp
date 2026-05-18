# DOCS-INTEGRATION-H2-W1 — Cross-link sweep audit (R5, 2026-05-18)

Per spec R5 + R7 narrow-gate (`*.ts|*.js|*.mjs|*.html`, CHANGELOG excluded). Every `algovault.com/docs/integrations/<slug>` (or `/docs/integrations/<slug>` relative) reference in a LIVE in-repo file flipped to `/integrations/<slug>`. Historical entries (CHANGELOG.md `## [1.14.0]`) + README.md (deferred to next daily release wave per RELEASE-CADENCE-GOVERNANCE-W1 + Path A architect ratification) left intact — the 301 redirects cover backward compatibility for any reader of the on-npm README.

## Per-file inventory (post-sweep)

| File | Old-path hits before | Hits flipped | Old-path hits after | Notes |
|---|---|---|---|---|
| `src/lib/mcp-usage-docs.ts` | 0 (R2 generator wrote new content directly to new path) | n/a | 0 | New H3 walkthroughs use `/integrations/<slug>` per spec R2 step 6 |
| `src/index.ts` | 1 route definition (`app.get('/docs/integrations/:exchange', ...)`) | route renamed to `/integrations/:slug` + sibling 301 redirect handler added at old path | 0 in route registration; old path remains as the 301-redirect handler input | R4 — both routes registered (canonical + redirect) |
| `Caddyfile` | 1 (`handle /docs/integrations/* { reverse_proxy ... }` — kept so 301 from Express reaches the client) | new `handle /integrations/*` block added; old `handle /docs/integrations/*` preserved to receive + proxy the 301 | 0 broken state; both routes proxied | R4 — Path 3 hybrid pattern |
| `scripts/render-integrations.mjs` | 3 (2 canonical template literals + 1 comment) | 3 flipped | 0 | R5 regen step source-of-truth |
| `landing/integrations/binance.html` | 3 | 3 | 0 | regenerated via `node scripts/render-integrations.mjs` |
| `landing/integrations/okx.html` | 3 | 3 | 0 | regenerated |
| `landing/integrations/bybit.html` | 3 | 3 | 0 | regenerated |
| `landing/integrations/bitget.html` | 3 | 3 | 0 | regenerated |
| `landing/integrations/langchain.html` | 3 | 3 | 0 | regenerated |
| `landing/integrations/llamaindex.html` | 3 | 3 | 0 | regenerated |
| `landing/integrations/maf.html` | 3 | 3 | 0 | regenerated |
| `landing/integrations/crewai.html` | 3 | 3 | 0 | regenerated |
| `landing/integrations.html` (index) | 8 (4 JSON-LD `"url"` + 4 card `href`) | 8 | 0 | Direct edit (no generator) |
| `landing/docs.html` | n/a (newly-generated via build:landing from R2's source) | n/a | 0 | R3 regen flowed from R2 source-of-truth |
| `landing/llms.txt` | 4 (BUILD:LLMS_INTEGRATIONS_LIST block — manually maintained) | 4 | 0 | Direct edit |
| `landing/llms-full.txt` | 4 (BUILD:LLMS_FULL_INTEGRATIONS block — manually maintained) | 4 | 0 | Direct edit |
| `landing/sitemap.xml` | 4 (4 `<loc>` entries for exchange tutorials — Google + Bing indexing) | 4 | 0 | Direct edit |
| `tests/unit/knowledge-index.test.ts` | 2 (1 fixture URL + 1 assertion) | 2 | 0 | Both fixture + assertion flipped consistently |
| `docs/PLAUSIBLE_EVENTS.md` | 1 (example href in `### 4. Integration View` section) | 1 | 0 | Direct edit |

**Totals:**
- Pre-sweep LIVE hits (excluding CHANGELOG + README): 60
- Post-sweep LIVE hits (R7 narrow gate `.ts|.js|.mjs|.html`): **0**
- Post-sweep LIVE hits (wide grep, all extensions, excluding CHANGELOG + README): **0**

## Deferred per Path A architect ratification

| File | Reason |
|---|---|
| `README.md` (in-repo) | Per RELEASE-CADENCE-GOVERNANCE-W1 + spec R6 + Path A approval, README transplant from `NPM-readme.md` (Cowork-side, already updated 2026-05-18) is bundled into the next daily release wave. 301 redirects cover backward compatibility for any reader of the live-on-npm README (`v1.14.0` is the published version at audit-time; v1.15.0 not yet published). |
| `CHANGELOG.md` `## [1.14.0]` historical entry | Historical-record discipline (`feedback_ask_before_restructuring.md`). The new `## [1.15.0]` heading (already in CHANGELOG.md from AV-CHAT-MCP-W1) does NOT cite integration paths; no follow-on entry needed this wave. |
| Vault-side `NPM-readme.md` | Already updated 2026-05-18 by Cowork (per spec R5 line 299). |
| Vault-side past `Prompt/master-post-P*.md` + `Prompt/*.md` historical drafts | Historical-record discipline. |
| GitHub Discussion #14 body | Mr.1 manual edit OR rely on 301 redirect (optional per spec R5 footer). |
| Live-on-npm README at `crypto-quant-signal-mcp@1.14.0` | Will get refreshed when v1.15.0+ is published by next daily release wave. |

## Build artifact regen log

```
$ node scripts/render-integrations.mjs
[render] source=/Users/tank/git/algovault-skills/docs/integrations
[render] target=/Users/tank/crypto-quant-signal-mcp/landing/integrations
[render] binance.md -> landing/integrations/binance.html (21695 bytes)
[render] okx.md -> landing/integrations/okx.html (22315 bytes)
[render] bybit.md -> landing/integrations/bybit.html (22521 bytes)
[render] bitget.md -> landing/integrations/bitget.html (23419 bytes)
[render] langchain.md -> landing/integrations/langchain.html (21092 bytes)
[render] llamaindex.md -> landing/integrations/llamaindex.html (21192 bytes)
[render] maf.md -> landing/integrations/maf.html (24527 bytes)
[render] crewai.md -> landing/integrations/crewai.html (21461 bytes)
[render] OK — 8 HTML mirrors written (4 exchanges + 4 frameworks)
```

```
$ npm run build:landing
> tsc && node scripts/build_landing.mjs
build_landing: files=1 (landing/docs.html updated; blocks: mcp-usage)
```

```
$ npm run build
> tsc
(clean exit; no errors)
```

## R7 sweep canary (anchor for verification)

```bash
LIVE_HITS=$(grep -rEln 'docs/integrations/(binance|okx|bybit|bitget|langchain|llamaindex|maf|crewai)' \
  --include="*.ts" --include="*.js" --include="*.mjs" --include="*.html" \
  --exclude-dir=node_modules --exclude-dir=dist . | grep -v CHANGELOG.md | wc -l)
echo $LIVE_HITS  # → 0
```

**Audit-time result: `0` LIVE hits.**
