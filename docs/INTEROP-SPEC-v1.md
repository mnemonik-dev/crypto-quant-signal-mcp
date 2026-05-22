# AlgoVault Verifiable-Signal Interop Spec v1.0

**Status:** Draft (v1.0, 2026-05-22)
**Author of record:** AlgoVault Labs
**Schema URL:** `https://raw.githubusercontent.com/AlgoVaultLabs/crypto-quant-signal-mcp/main/schemas/verifiable-signal-v1.json`
**License:** Same as the host repository (`crypto-quant-signal-mcp` LICENSE file).

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in all capitals.

---

## 1. Scope

This document specifies the wire format of an AlgoVault Verifiable-Signal — the canonical JSON envelope used to convey a directional trading verdict, its calibrated confidence, and its accompanying verification metadata from a signal emitter to a downstream consumer. The spec defines the field shape (`schemas/verifiable-signal-v1.json`), the normative semantics of each field, and two first-class transport bindings (HTTP REST + Python in-process). It also documents one reference-architecture integration pattern (MCP-to-MCP via IDE-mediated orchestration) for ecosystems where direct backend-to-backend Model Context Protocol consumption is not yet established. The spec deliberately constrains itself to the wire format and the transport bindings; it does not prescribe the upstream signal-generation method, the downstream execution policy, or any commercial relationship between emitter and consumer.

---

## 2. Non-goals (v1.0)

The following are explicitly **out of scope** for v1.0 and are deferred to v2 or later:

- **FIX protocol binding.** Institutional execution venues that ingest signals via FIX SHOULD wrap the canonical envelope in a FIX message at the integration boundary; a normative FIX binding is deferred to v2.
- **gRPC binding.** Server-to-server gRPC consumers SHOULD use a generated stub that maps to the JSON envelope's field types; a normative `.proto` definition is deferred to v2.
- **WebSocket streaming binding.** Continuous signal streams SHOULD wrap individual signals in the canonical envelope and frame them per the host WebSocket convention; a normative streaming binding is deferred to v2.
- **Signal-revocation semantics.** A retracted-or-superseded signal model (analogous to an `OrderCancel`) is deferred to v2.
- **Authentication / authorization protocol.** v1.0 prescribes only the recommended HTTP transport-level auth header convention (§6a). Token issuance, rotation, and key-management are out of scope.
- **On-chain anchoring contract ABI.** The `merkle_proof` field shape is normative; the specific on-chain contract that publishes Merkle roots is emitter-defined and deferred.

---

## 3. Semantic version policy

This spec follows semantic versioning at the schema level. **Major** version bumps (`v2.0`) MAY introduce breaking changes (renamed fields, tightened required-set, removed enums); consumers parsing a v1.x payload against a v2.x schema MUST expect failure. **Minor** version bumps (`v1.1`, `v1.2`) introduce additive fields only and remain backward-compatible with v1.0 consumers. **Patch** version bumps (`v1.0.1`) cover documentation clarifications, typo fixes, and example-value updates with no schema change. The schema's `$id` URL embeds only the major version (`verifiable-signal-v1.json` for v1.x.x; `verifiable-signal-v2.json` for v2.x.x); patch and minor versions reuse the same `$id`.

---

## 4. Canonical JSON shape

A conformant signal payload is a JSON object containing the fields below. Fields marked **REQUIRED** MUST be present and non-null (subject to per-field type rules); fields marked **OPTIONAL** MAY be omitted or set to `null` per the schema. The schema's top-level `additionalProperties` is `true` (per §8 forward-compatibility policy); emitters MAY include emitter-specific fields beyond those documented below, and consumers SHALL preserve unknown fields when re-emitting.

### 4.1 Standard fields

| Field | Required | Type | Semantics |
|---|---|---|---|
| `market` | REQUIRED | string (enum) | The asset class the signal applies to. Permitted values: `crypto`, `us-stock`, `polymarket`, `forex`, `options`, `futures`, `fx`, `commodity`. Consumers MAY route on this field to select a downstream execution venue. |
| `action` | REQUIRED | string (enum) | The directional verdict. Permitted values: `buy`, `sell`, `short`, `cover`, `hold`. `hold` is a first-class verdict for spec-compliant emitters whose calibration MAY decline to act. The top-level `action` and `composite_verdict.verdict` SHALL be kept synchronized. |
| `symbol` | REQUIRED | string (1-64 chars) | The market-symbol identifier (venue-native or canonical-form per emitter convention). Consumers SHOULD treat this as opaque and look up venue-specific routing externally. Example: `"BTC"`, `"AAPL"`, `"EUR/USD"`. |
| `price` | OPTIONAL | number (≥0) or `null` | Reference price at the moment of signal emission, in the symbol's quote currency. MAY be `null` when the verdict is `hold` or when the emitter does not publish a reference price. |
| `quantity` | OPTIONAL | number (≥0) or `null` | Suggested position size, in base-asset units. MAY be `null` when the emitter does not prescribe sizing; consumers SHOULD size positions per their own risk policy when this field is absent. |
| `timeframe` | OPTIONAL | string | The bar-density / horizon the signal was generated against. Conformant emitters SHOULD use one of the standard intervals (`1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `8h`, `12h`, `1d`); consumers MAY treat unknown values as opaque. |
| `executed_at` | OPTIONAL | string (ISO-8601) or `null` | Optional timestamp at which the signal was acted upon. Used when the same envelope is re-emitted as a post-execution record. MAY be `null` for forward-looking signals. |
| `content` | OPTIONAL | string (≤8192 chars) or `null` | Optional free-form rationale text. Consumers MAY surface this to end users; emitters SHALL NOT place machine-readable state here that consumers are expected to parse. |

### 4.2 Verification-and-derivation fields

| Field | Required | Type | Semantics |
|---|---|---|---|
| `composite_verdict` | REQUIRED | object | Structured representation of the directional verdict together with calibrated confidence and (optionally) the weighted factor decomposition that produced it. See §4.4. |
| `merkle_proof` | OPTIONAL | object or `null` | Cryptographic anchor binding this signal to a published commitment (e.g., an on-chain Merkle root). When present, conformant consumers MAY independently verify the proof against the cited root without contacting the emitter. See §4.5. |
| `cross_venue_metadata` | OPTIONAL | object or `null` | Documents which venues were consulted in producing the verdict and how they agreed. Enables consumers to audit cross-venue intelligence claims. See §4.6. |

### 4.3 Metadata fields

| Field | Required | Type | Semantics |
|---|---|---|---|
| `version` | REQUIRED | string (`MAJOR.MINOR` pattern) | Spec version this payload conforms to. Conformant emitters SHALL set this to the major.minor version of the schema used to produce the payload (e.g. `"1.0"`). Consumers SHALL reject payloads whose major version they do not implement. |
| `signal_id` | REQUIRED | string (1-128 chars) | Globally-unique identifier for this signal emission. Conformant emitters SHALL produce a value that is collision-free across the emitter's signal corpus (e.g., UUID v4, ULID, or a deterministic content-addressed hash). Consumers MAY use this field for idempotency keys. |
| `emitted_at` | REQUIRED | string (ISO-8601, UTC) | Timestamp at which the emitter generated this signal. Conformant emitters SHALL use UTC and SHOULD include sub-second precision when available. |

### 4.4 `composite_verdict` (object)

| Sub-field | Required | Type | Semantics |
|---|---|---|---|
| `verdict` | REQUIRED | string (enum) | Same enum as top-level `action` (`buy`, `sell`, `short`, `cover`, `hold`). Conformant emitters SHALL keep `composite_verdict.verdict` and top-level `action` synchronized; a mismatch is an emitter bug. |
| `confidence` | REQUIRED | number in [0.0, 1.0] | A floating-point value representing the emitter's calibrated confidence in the verdict. Emitters SHOULD calibrate against historical outcomes; consumers MAY threshold on this value (e.g., ignore verdicts below 0.6). |
| `factor_weights` | OPTIONAL | object (string → number) | Map of factor-name → contribution-weight (signed scalar) documenting which sub-factors drove the verdict and by how much. Sum of absolute weights is emitter-defined and need not equal 1.0. Consumers MAY surface this for explainability without depending on a fixed factor taxonomy. |

### 4.5 `merkle_proof` (object)

| Sub-field | Required | Type | Semantics |
|---|---|---|---|
| `leaf` | REQUIRED | string (`^0x[0-9a-fA-F]+$`) | Hex-encoded leaf hash, typically `sha256` or `keccak256` of the canonical-form signal payload. |
| `root` | REQUIRED | string (`^0x[0-9a-fA-F]+$`) | Hex-encoded Merkle root the leaf is proved against. |
| `path` | REQUIRED | array of `{sibling: hex, position: "left"\|"right"}` | Ordered list of sibling hashes from leaf to root. Each entry's `position` indicates whether the sibling is the left or right child relative to the current node when recomputing the parent. |
| `hash_algo` | OPTIONAL | string (enum: `sha256`, `keccak256`, `blake3`) | Hash function used to derive `leaf` and to recompute parent nodes from `path`. Defaults to `sha256` when omitted. |
| `published_at` | OPTIONAL | string (ISO-8601, UTC) or `null` | Timestamp the root was first published. |
| `anchor_url` | OPTIONAL | string (URI) or `null` | URL where consumers MAY independently fetch the published root for verification (e.g., a block-explorer URL for an on-chain commitment, or an HTTP endpoint returning the root). |

### 4.6 `cross_venue_metadata` (object)

| Sub-field | Required | Type | Semantics |
|---|---|---|---|
| `venues_consulted` | REQUIRED | array of strings (≥1 item) | Venue identifiers (emitter-defined; typically uppercase short codes like `HL`, `BINANCE`, `BYBIT`). |
| `venue_agreement_score` | OPTIONAL | number in [0.0, 1.0] or `null` | Fraction of consulted venues whose individual sub-verdicts agreed with the composite. 1.0 = unanimous; 0.5 = split. Consumers MAY threshold for higher-confidence signal selection. |
| `per_venue_verdicts` | OPTIONAL | object (string → enum) | Map of venue-id → that venue's individual sub-verdict, for explainability. Keys SHALL be drawn from `venues_consulted`. |

---

## 5. JSON Schema

The canonical machine-readable schema is published at:

```
https://raw.githubusercontent.com/AlgoVaultLabs/crypto-quant-signal-mcp/main/schemas/verifiable-signal-v1.json
```

Inline excerpt of the top of the file (informative; the file is the SoT):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://raw.githubusercontent.com/AlgoVaultLabs/crypto-quant-signal-mcp/main/schemas/verifiable-signal-v1.json",
  "title": "AlgoVault Verifiable-Signal v1.0",
  "type": "object",
  "required": ["version", "signal_id", "emitted_at", "market", "action", "symbol", "composite_verdict"]
}
```

Conformant consumers SHOULD validate incoming payloads against this schema using a JSON Schema 2020-12-capable validator (e.g., `ajv` for Node.js, `jsonschema` for Python, `gojsonschema` for Go) before processing.

---

## 6. Transport bindings

This section specifies two first-class transport bindings (HTTP REST + Python in-process) plus one reference-architecture pattern (MCP-to-MCP). Future versions MAY add additional first-class bindings per §2.

### 6a. REST POST JSON (HTTP-bound)

A consumer that exposes an HTTP endpoint to ingest signals SHALL accept `POST` requests with `Content-Type: application/json` whose request body is a single JSON object conforming to the schema in §5.

**Request headers (REQUIRED unless noted):**

| Header | Required | Value |
|---|---|---|
| `Content-Type` | REQUIRED | `application/json` |
| `Accept` | RECOMMENDED | `application/json` |
| `Authorization` | RECOMMENDED | `Bearer <token>` per [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750). Token issuance is out of scope. |
| `Idempotency-Key` | RECOMMENDED | A consumer-chosen idempotency key (often the emitter's `signal_id`) per the [IETF Idempotency-Key draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/). Consumers SHALL ignore duplicate requests with the same key for the configured retention window. |

**Successful response (2xx):**

A consumer that accepts the signal SHALL return HTTP `200 OK` (signal processed synchronously) or `202 Accepted` (signal queued for asynchronous processing) with a JSON body containing at minimum:

```json
{ "received_at": "2026-05-22T16:11:30Z", "signal_id": "<the emitter's signal_id>" }
```

**Error response (4xx / 5xx):**

A consumer that rejects the signal SHALL return an HTTP error status with a JSON body of the shape:

```json
{
  "error_code": "<stable machine-readable code>",
  "message": "<human-readable diagnostic>",
  "instance_path": "<optional JSON Pointer to the offending field>"
}
```

Recommended `error_code` values: `SCHEMA_VALIDATION_FAILED` (400), `UNAUTHORIZED` (401), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500). Consumers MAY extend with implementation-specific codes; consumers SHALL document their full error-code surface.

### 6b. Python in-process adapter (Nautilus-style)

A consumer running inside a Python event-driven trading engine (e.g., Nautilus Trader, Backtrader, custom) SHALL surface the signal as a typed `Data` subclass routed through the engine's message bus. The recommended adapter sketch for the Nautilus Trader `Actor`/`Strategy` pattern is below; equivalent patterns SHOULD be used for other engines.

```python
from dataclasses import dataclass
from typing import Optional, Dict
from nautilus_trader.core.data import Data
from nautilus_trader.model.identifiers import ClientId
from nautilus_trader.common.data import DataType


@dataclass
class AlgoVaultSignal(Data):
    """Typed in-process representation of a Verifiable-Signal v1.0 payload."""

    version: str
    signal_id: str
    market: str
    action: str
    symbol: str
    confidence: float
    price: Optional[float] = None
    quantity: Optional[float] = None
    timeframe: Optional[str] = None
    content: Optional[str] = None
    factor_weights: Optional[Dict[str, float]] = None
    merkle_proof: Optional[dict] = None
    cross_venue_metadata: Optional[dict] = None


class AlgoVaultDataAdapter:
    """Fetches Verifiable-Signal v1.0 payloads from an emitter and publishes
    them into the host engine's message bus as AlgoVaultSignal data points.
    Implementation of the fetch loop (polling, webhook, MCP) is engine-specific."""

    CLIENT_ID = ClientId("ALGOVAULT")

    def publish(self, actor, payload: dict) -> None:
        """Convert a validated v1.0 payload into AlgoVaultSignal and publish."""
        signal = AlgoVaultSignal(
            version=payload["version"],
            signal_id=payload["signal_id"],
            market=payload["market"],
            action=payload["action"],
            symbol=payload["symbol"],
            confidence=payload["composite_verdict"]["confidence"],
            price=payload.get("price"),
            quantity=payload.get("quantity"),
            timeframe=payload.get("timeframe"),
            content=payload.get("content"),
            factor_weights=payload["composite_verdict"].get("factor_weights"),
            merkle_proof=payload.get("merkle_proof"),
            cross_venue_metadata=payload.get("cross_venue_metadata"),
        )
        actor.publish_data(
            DataType(AlgoVaultSignal, metadata={"market": signal.market}),
            signal,
        )


class MyStrategy:
    def on_start(self) -> None:
        self.subscribe_data(
            data_type=DataType(AlgoVaultSignal, metadata={"market": "crypto"}),
            client_id=AlgoVaultDataAdapter.CLIENT_ID,
        )

    def on_data(self, data) -> None:
        if isinstance(data, AlgoVaultSignal):
            if data.action == "hold" or data.confidence < 0.6:
                return
            # ... route to order management
```

This sketch is a normative pattern, not a runnable example. A runnable Nautilus example is published separately under the AlgoVault G2 integrations mono-repo.

### 6c. MCP outbound (reference architecture, non-first-class in v1.0)

Direct backend-to-backend Model Context Protocol consumption — a consumer's server runtime opening an MCP client connection to an emitter's MCP server and invoking `tools/call` to fetch signals — is **not** a first-class binding in v1.0. As of 2026-Q2, the MCP ecosystem is dominated by IDE-side and agent-side MCP clients (Claude Code, Cursor, Codex, etc.); server-side MCP-client implementations are nascent and lack widely-adopted libraries for the streamable-HTTP transport and the multi-step session-init handshake.

The recommended interim pattern is **IDE-mediated orchestration**: the consumer binds the emitter's MCP server alongside its own MCP server inside an LLM-driven IDE; the orchestrating model invokes the emitter's signal-fetching tool, validates the response against this spec, and then invokes the consumer's signal-ingestion tool. This pattern preserves the canonical wire format (the LLM passes the v1.0 envelope between tool calls unchanged) without requiring server-side MCP-client infrastructure.

A first-class MCP outbound binding is deferred until at least three downstream consumer platforms ship server-side MCP-client support; the binding spec SHALL be re-evaluated at that point.

---

## 7. Worked example

The fixture below is a real `get_trade_call` response fetched live from the AlgoVault MCP server (Reference implementation: AlgoVault MCP at `https://api.algovault.com/mcp`, `crypto-quant-signal-mcp 1.17.0`) at 2026-05-22T16:11:21Z UTC and reshaped into the canonical envelope per the derivation rules documented in `tests/fixtures/verifiable-signal-v1-sample.README.md`. The specific numerical values (price, confidence, rationale text) reflect that point-in-time market state and are not durable facts; refetch the live source-of-truth at `https://api.algovault.com/api/performance-public` (aggregate track record) or call `get_trade_call` again (per-asset current state) for current values.

```json
{
  "version": "1.0",
  "signal_id": "e3a83395-0ea3-4671-9eed-7ee4710ce93d",
  "emitted_at": "2026-05-22T16:11:21Z",
  "market": "crypto",
  "action": "hold",
  "symbol": "BTC",
  "price": 76742.4,
  "quantity": null,
  "timeframe": "5m",
  "executed_at": null,
  "content": "Trending regime, downward bias. Funding pressure mild. Compression building, breakout setup pending. Trend persistence elevated; momentum structure. Conditions mixed; better setups likely available elsewhere.",
  "composite_verdict": {
    "verdict": "hold",
    "confidence": 0.52
  },
  "merkle_proof": null,
  "cross_venue_metadata": null
}
```

The fixture file at `tests/fixtures/verifiable-signal-v1-sample.json` is the canonical copy; the inline above is informative. The fixture's `merkle_proof` and `cross_venue_metadata` fields are `null` in this snapshot because the reference emitter does not yet populate them in the live response; the schema permits both as optional, and conformant emitters MAY populate them when the underlying anchoring / cross-venue derivation pipeline emits them. The example demonstrates conformance; it does not define it.

---

## 8. Forward compatibility

A v1.0 consumer SHALL ignore unknown top-level fields (the schema's `additionalProperties: true` rule). This permits a v1.x emitter to add minor-version fields without breaking v1.0 consumers. Conversely, a v1.x emitter SHALL NOT change the semantics of any v1.0 field, narrow the v1.0 type, or remove any v1.0 field from the `required` set; such changes are reserved for v2.0. Consumers re-emitting a v1.x signal SHALL preserve unknown fields by passing them through (a "round-trip preservation" requirement). Consumers SHOULD log unknown fields at debug level so operators can surface drift between consumer and emitter versions.

---

## 9. Map Anchor (`system-map.md` notation)

This spec documents the existing wire shape of the `get_trade_call` MCP tool response (and its alias `get_trade_signal`) without changing the runtime emit logic. No new producer or consumer edge is added; no MCP tool, Postgres table, cron entry, or external publish target is introduced. Per the project-level `system-map.md` §5 protocol, this spec's landing wave declares:

```
system-map.md updated: NONE — internal change only
```

A future wave that begins emitting `merkle_proof`, `cross_venue_metadata`, or `factor_weights` natively in the runtime response (rather than as schema-optional fields populated to `null`) WILL mutate the `get_trade_call` producer edge and MUST update `system-map.md` accordingly.

---

## 10. References

- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) — Key words for use in RFCs to Indicate Requirement Levels
- [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750) — The OAuth 2.0 Authorization Framework: Bearer Token Usage
- [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words
- [JSON Schema 2020-12 specification](https://json-schema.org/draft/2020-12/schema) — Validation vocabulary used by the canonical schema
- [IETF Idempotency-Key Header draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) — Recommended HTTP header convention for §6a
- [Model Context Protocol specification](https://spec.modelcontextprotocol.io/) — Underlying protocol for the reference MCP implementation cited in §7
