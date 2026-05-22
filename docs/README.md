# `docs/` — repository documentation index

Specifications, runbooks, and analytics notes for `crypto-quant-signal-mcp`.

## Specifications

- **[INTEROP-SPEC-v1.md](./INTEROP-SPEC-v1.md)** — AlgoVault Verifiable-Signal Interop Spec v1.0. Canonical wire format for verifiable trading signals (JSON Schema 2020-12 + REST POST binding + Python in-process adapter binding + MCP outbound reference architecture). Machine-readable schema lives at [`../schemas/verifiable-signal-v1.json`](../schemas/verifiable-signal-v1.json). Validate with `npm run validate-spec`.

## Runbooks

- **[RUNBOOK-VENUE-SHADOW-ONBOARDING.md](./RUNBOOK-VENUE-SHADOW-ONBOARDING.md)** — Process for onboarding a new exchange adapter as a shadow venue and promoting to live status.
- **[SHADOW_SEED_DECISION_RUNBOOK.md](./SHADOW_SEED_DECISION_RUNBOOK.md)** — Decision criteria for promoting shadow-seeded signals to public surfaces.

## Analytics

- **[PLAUSIBLE_EVENTS.md](./PLAUSIBLE_EVENTS.md)** — Plausible analytics event taxonomy.
- **[PLAUSIBLE_GEO_GOALS.md](./PLAUSIBLE_GEO_GOALS.md)** — Geo-segmented goal definitions for Plausible analytics.

## Integrations

- **[integrations/](./integrations/)** — Per-platform integration notes (currently a placeholder for the future G2 `algovault-integrations/` mono-repo).
