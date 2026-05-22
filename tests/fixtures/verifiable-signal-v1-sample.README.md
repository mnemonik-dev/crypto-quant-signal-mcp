# verifiable-signal-v1-sample.json — fixture README

**Fetched at:** 2026-05-22T16:11:46Z (UTC)
**Fetched from:** `https://api.algovault.com/mcp` (streamable HTTP, MCP protocol version `2025-06-18`)
**Source tool:** `get_trade_call({coin:"BTC", timeframe:"5m", includeReasoning:true, exchange:"BINANCE"})`
**Server reported version:** `crypto-quant-signal-mcp 1.17.0`

## Live data caveat

This fixture is a **point-in-time projection** of one live `get_trade_call` response, reshaped into the canonical AlgoVault Verifiable-Signal v1.0 wire format. The numerical values inside (price, confidence, the reasoning text) are **not facts** — they reflect the market state at the moment of fetch and will be stale by the time you read this. **Do not cite these values as track-record claims.** Refetch live from `https://api.algovault.com/api/performance-public` (or call `get_trade_call` again) for current state.

## Derivation rules used

The live `get_trade_call` response shape is documented at `src/index.ts:256-330`. The reshape into the canonical envelope follows the Q1-ratified derivation rules from `INTEROP-SPEC-v1-W1` Plan Mode:

| Envelope field | Source | Notes |
|---|---|---|
| `version` | constant `"1.0"` | Spec version, not product version. |
| `signal_id` | freshly-generated UUID v4 | Live `get_trade_call` does not yet emit a stable signal_id; emitter MAY generate per-request. |
| `emitted_at` | live `.timestamp` (unix epoch seconds) → ISO-8601 UTC | `1779466281` → `2026-05-22T16:11:21Z`. |
| `market` | derived constant `"crypto"` | v1.0: all AlgoVault venues are crypto perp. v1.x can widen. |
| `action` | live `.call` lowercased | `HOLD` → `hold`. Same enum as `composite_verdict.verdict`. |
| `symbol` | input `coin` argument | `BTC`. |
| `price` | live `.price` | Present even for HOLD verdicts in this emitter. |
| `quantity` | not in live response | `null`. Consumer sizes their own positions. |
| `timeframe` | input `timeframe` argument | `5m`. |
| `executed_at` | not applicable (forward-looking signal) | `null`. |
| `content` | live `.reasoning` | Free-form rationale text. |
| `composite_verdict.verdict` | live `.call` lowercased | `hold`. Always synced with top-level `action`. |
| `composite_verdict.confidence` | live `.confidence` / 100 | `52` → `0.52` (envelope uses 0.0-1.0 float; live emits 0-100 int). |
| `composite_verdict.factor_weights` | not yet emitted by runtime | Omitted (optional in schema). |
| `merkle_proof` | not yet emitted by runtime | `null` (optional in schema). |
| `cross_venue_metadata` | not yet emitted by runtime | `null` (optional in schema). |

## Forward-compatibility note

When the runtime emits `merkle_proof`, `cross_venue_metadata`, or `factor_weights` natively (planned for v1.x.y schema-additive minor versions), this fixture will be refreshed in a follow-up wave. The schema's `additionalProperties: true` rule means consumers parsing today's fixture will continue to parse future fixtures with additive fields without breakage.

## Reproducing this fetch

```bash
set -euo pipefail
URL='https://api.algovault.com/mcp'
TMP=$(mktemp -d)

# 1. initialize → capture mcp-session-id
curl -sS -D "$TMP/h1" -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"interop-fixture-fetch","version":"1.0.0"}}}' >/dev/null
SID=$(awk 'BEGIN{IGNORECASE=1} /^mcp-session-id:/{gsub(/\r/,""); print $2; exit}' "$TMP/h1")

# 2. ack
curl -sS -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' >/dev/null

# 3. fetch
curl -sS -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_trade_call","arguments":{"coin":"BTC","timeframe":"5m","includeReasoning":true,"exchange":"BINANCE"}}}' \
  | awk '/^data: /{sub(/^data: /,""); print}' \
  | jq -r '.result.content[0].text' \
  | jq '.'
```

The raw response carries additional fields (`.indicators.*`, `.regime`, `.coin`, `._algovault.*`) that the canonical envelope does not surface in v1.0. Conformant emitters MAY include them as `additionalProperties` (the envelope's `additionalProperties: true` permits it); the spec text describes only the canonical surface.
