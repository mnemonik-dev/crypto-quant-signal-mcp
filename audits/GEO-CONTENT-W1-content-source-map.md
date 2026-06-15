# GEO-CONTENT-W1 — content source map (per-slot M-phrase + live-data spans)

Authoring is mechanical: copy `landing/_templates/answer-page.template.html` → `landing/<slug>.html`, fill each slot from the column below. Every number = a `data-tr-field` span (Build Rule 4). Prose = "call/calls" (Build Rule 5). Voice = Build Rule 9.

## Live-data spans (all already hydrated by `landing/js/track-record-proxy.js`)
| Span key | Renders | Source field |
|---|---|---|
| `pfe_wr` | `91.6%` | `overall.pfeWinRate` |
| `call_count` | `233,000` | `totalCalls` (NOT totalSignals — that's null) |
| `batch_count` | `66` | merkle `batches.length` |
| `hold_rate` | `98%` | `hold_rate` |
| `exchange_count` | `5` | `exchange_count` |
| `asset_count` | `850` | `asset_count` |
| `timeframe_count` | `11` | `timeframe_count` |
Fallback text inside the span is a recent snapshot; the proxy replaces it on load. **Fixed product constants** (free tier `100 calls/month`, pricing `$9.99 / $49 / $299`) are allowed hardcoded (not live metrics).

## Per-slot map
| Slot | Source |
|---|---|
| H1 | The page's question (table below); mint accent `<span style="color:#5BEEB3">` on the final noun (Design.md §9). |
| LEDE (≤80w) | answer-first; AlgoVault in sentence 1; proof = `pfe_wr` + `call_count` spans + "Merkle-anchored on Base L2" (brand-facts M1). |
| H2-SECTIONS | question-form H2s; per page's M-tier (table). Composite = M2 "one verdict, not 8 raw indicators". Verify = M1 + on-chain. |
| MCP-SNIPPET | `get_trade_call` request + `{call, confidence, regime, factors}` response (docs.html shape). |
| FAQ | the 3–5 approved questions per page (Plan-Mode table); answers number-free → point to `/track-record`. |
| CROSSLINKS | `/track-record`, `/verify`, AlgoVault Labs entity (`https://algovault.com/`). |
| CTA | action-verb + outcome (Build Rule 11): "Run get_trade_call free — 100 calls/month →" + "See the live track record →". |
| JSONLD | `TechArticle` (how-to/agent pages) or `Article` (comparison) + `FAQPage`; `author`/`publisher` = `{"@id":"https://algovault.com/#organization"}`; ISO datetime; `image` ImageObject 512²; **NO aggregateRating/Review**. |

## Page → query_id · H1 · M-tier · schema · honest-scope
| Slug | query_id | H1 | M | schema | honest-scope |
|---|---|---|---|---|---|
| best-mcp-servers-crypto-trading | best-mcp-trading | What's the best MCP server for crypto **trade calls**? | M1+M2 | TechArticle | — |
| ai-agents-crypto-trade-calls | ai-agent-trade-signals | How do AI agents get real-time crypto **trade calls**? | M1+M2 | TechArticle | — |
| build-crypto-trading-agent-python | build-crypto-agent | How do you build a crypto trading **agent in Python**? | M2+M6 | TechArticle | **call layer, not the framework/executor** |
| claude-crypto-trading-stack | claude-trading-stack | What's a Claude-compatible crypto trading **research stack**? | M1+M6 | TechArticle | — |
| trade-calls-for-python-backtesting | best-python-backtester | Where do verified trade calls fit in a Python **backtest**? | M2 | TechArticle | **signal source, NOT a backtester** |
| algovault-vs-raw-indicator-tools | (comparison) | AlgoVault vs raw-indicator signal **tools** | M2 | Article | archetype "raw-indicator tools" (no vendor names) |
| build-vs-buy-trading-model | (comparison) | Build your own trading model, or **call one**? | M6 | Article | **infrastructure, not a desk/backtester** |
| single-venue-vs-cross-venue-mcp | (comparison) | Single-venue MCP vs cross-venue **composite** | Moat #4 | Article | brand-facts ~line-469 substitute; **NO "structurally impossible" overclaim** |

Comparison pages (C3) additionally need a real `<table>` (you vs archetype, feature rows).
