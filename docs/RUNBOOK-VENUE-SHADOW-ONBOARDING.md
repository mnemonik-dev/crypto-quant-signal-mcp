# Runbook — Onboarding a new exchange venue under the SHADOW-PROMOTE lifecycle

**Wave context:** EXCHANGE-SHADOW-PROMOTE-W1 (2026-05-16).

This runbook is the canonical operator process for adding a new exchange
integration. New venues default to `status='shadow'` and auto-promote via the
daily `evaluate-venues` cron when they accumulate `asset_count × 10` BUY/SELL
signals with PFE WR ≥ 0.80 (HOLDs excluded). The full state machine lives in
`src/lib/venue-store.ts`; the cron logic in `src/scripts/evaluate-venues.ts`;
the public exposure in `src/index.ts` `/api/performance-shadow`.

---

## Step 1 — Pre-integration probe (10 minutes)

Run BEFORE writing any adapter code. Save outputs under
`audits/<wave>-pilot-probe-<venue>.md`.

### 1.a AUM / OI ranking

Per `project_aum_over_volume_cex_ranking`:

- **CEX candidates**: AUM ≥ $500M via `https://api.llama.fi/protocols`
  (DefiLlama) — filter `category: "CEX"` or cross-check Coingecko's
  exchange-trust-score page.
- **DEX candidates**: notional Open Interest ≥ $1B via DefiLlama protocol
  `tvl` field (use `?protocol=<slug>` endpoint).

If the venue doesn't clear these thresholds, **stop here** — the venue's
signal density won't justify the integration cost.

### 1.b Public REST API surface

Probe each of the three required endpoints with `curl -fsS -o /dev/null -w
"%{http_code}\n"`:

1. **Candle / kline endpoint** — must return `[time, open, high, low, close,
   volume]` (or equivalent fields per the venue's docs). Confirm 11
   timeframes supported: `1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 12h, 1d`.
2. **Funding rate endpoint** — must return current + historical funding rates.
   Note the funding period (CEX is typically 8h; some venues are 1h or 4h —
   per-period rate must be annualized using the convention in
   `src/lib/adapters/<existing>.ts` per `AssetContext.fundingAnnualized`).
3. **Open Interest endpoint** — must return current notional OI.

### 1.c Streamable HTTP / WSS feed (optional but preferred)

Probe `wss://` or `https://stream...` per venue docs. If absent, fall back to
HTTP polling (matches existing 5-exchange pattern). Streamable feeds are
nice-to-have for future live-tick integration but NOT a hard requirement.

### 1.d Symbol naming convention

Sample the venue's instrument-list endpoint + check 5-10 known symbols
against AlgoVault canonical names:

- Crypto majors: `BTC`, `ETH`, `SOL` — expect `<COIN>USDT` /
  `<COIN>_USDT` / `<COIN>-USDT-SWAP` per venue conventions.
- TradFi (if venue offers): `TSLA`, `GOLD`, `SILVER` — check for aliases
  (`XAU`, `XAG`, etc.) per the existing `TRADFI_ALIASES` map shape in
  `src/lib/adapters/binance.ts`.
- Memes: any 1000-prefixed listings? (Document for the adapter's
  `SYMBOL_OVERRIDES` map.)

### 1.e Rate limits

Read the venue's docs for per-IP / per-API-key rate limits. Document:

- Request budget per minute / per second.
- Burst tolerance.
- Whether the venue rate-limits more aggressively from cloud-IP ranges (some
  CEXs block AWS/GCP-class IPs).

If the budget is tighter than 100 req/min, expect to add a request throttle
in the adapter (see `bitget.ts` for the existing throttle pattern).

### 1.f Probe outputs

Save the CSV row `(venue, kind, aum_or_oi, passes_threshold, rest_ok, ws_ok,
symbol_naming, rate_limit, api_quality, composite, notes)` to
`audits/<wave>-pilot-probe-<venue>.md`. Surface the top picks to Mr.1 for
ratification BEFORE writing adapter stubs.

---

## Step 2 — Author the adapter stub (1 hour)

Mirror the existing `src/lib/adapters/binance.ts` template — it's the
canonical shape:

```ts
// src/lib/adapters/<venue>.ts
import type { ExchangeAdapter, Candle, AssetContext, FundingData } from '../../types.js';
import { UpstreamRateLimitError } from '../errors.js';

const BASE_URL = '<venue REST base>';
const TIMEOUT_MS = 3000;

// Some venues use 1000-prefix for low-price tokens
const SYMBOL_OVERRIDES: Record<string, string> = { /* see binance.ts */ };

// Optional: TradFi alias map (probe per Plan-Mode coverage CSV)
const TRADFI_ALIASES: Record<string, string> = { /* GOLD: 'XAU' etc. */ };

export function to<Venue>Symbol(coin: string): string { /* ... */ }
export function from<Venue>Symbol(symbol: string): string { /* ... */ }

export class <Venue>Adapter implements ExchangeAdapter {
  getName(): string { return '<Venue>'; }
  async getCandles(coin, interval, startTime, _dex) { /* ... */ }
  async getAssetContext(coin, _dex) { /* ... */ }
  async getPredictedFundings(): Promise<FundingData[]> { /* ... */ }
  async getFundingHistory(coin, startTime) { /* ... */ }
  async getCurrentPrice(coin, _dex) { /* ... */ }
}
```

### 2.a Register in the dispatcher

Add the adapter to `src/lib/exchange-adapter.ts` `getAdapter()`:

```ts
case '<VENUE>':
  return new <Venue>Adapter();
```

### 2.b Widen the ExchangeId enum

Two sites in `src/types.ts`:

```ts
export type ExchangeId = 'HL' | 'BINANCE' | 'BYBIT' | 'OKX' | 'BITGET' | '<VENUE>';
```

### 2.c Widen the Zod schema enum + describe-text

Two sites in `src/index.ts` (`TRADE_CALL_SCHEMA.exchange` for
get_trade_call/signal + the get_market_regime registration's inline enum):

```ts
exchange: z.enum(['HL', 'BINANCE', 'BYBIT', 'OKX', 'BITGET', '<VENUE>'])
  .default('BINANCE')
  .describe("Exchange to analyze. 'BINANCE' = Binance USDT-M Futures (default), …, '<VENUE>' = <Venue display name>. Shadow venues (experimental, not yet on public dashboard) require explicit exchange param; query the mcp://algovault/venues resource for the live per-venue status table. Asset availability varies per venue — pass exchange explicitly to target a specific venue.")
```

---

## Step 3 — Seed the venues row (5 minutes)

Insert a new row at `status='shadow'`. Use `insertVenue()` from venue-store:

```ts
await insertVenue({
  exchangeId: '<VENUE>',
  status: 'shadow',
  assetCount: <probed-from-venue-exchangeInfo>,  // NOT COUNT(DISTINCT coin) from signals!
  notes: 'Pilot batch <N> per <WAVE>',
});
```

**Critical**: for a new venue, `asset_count` is the venue's TOTAL listed perp
catalog (probed from `<BASE_URL>/exchangeInfo` or equivalent at integration
time) — NOT `COUNT(DISTINCT coin) FROM signals WHERE exchange = ?`. The
latter is COSMETIC for the 5 already-promoted venues; the former is the
BINDING gate target for shadow → promoted transition. See the header note in
`migrations/003_seed_venues_promoted.sql` for the asset_count divergence.

Or via raw SQL:

```sql
INSERT INTO venues (
  exchange_id, status, asset_count, min_buy_sell_sample,
  integrated_at, extension_count, notes
) VALUES (
  '<VENUE>', 'shadow', <N>, <N*10>, NOW(), 0, '<wave-ref>'
)
ON CONFLICT (exchange_id) DO NOTHING;
```

---

## Step 4 — Deploy + wait for cron evaluations

Push the commit; GHA deploys; container restarts; `evaluate-venues.timer`
fires daily at 06:00 UTC. The decision tree:

- **Day 0-14**: NO-OP (within initial window).
- **Day 15+**:
  - IF `buy_sell_count ≥ asset_count × 10` AND `pfe_wr ≥ 0.80` → auto-promote
    + Telegram 🟢 `Venue PROMOTED: <VENUE>`.
  - ELSE (one-shot) → auto-extend + Telegram 🟡 `Venue auto-EXTENDED (day-15 miss)`.
- **Day 30+** after one extension:
  - Telegram 🔴 `Venue MANUAL DECISION REQUIRED (day-30, 2nd miss)`. NO
    automatic state change. Mr.1 manually decides PROMOTE / RETIRE /
    EXTEND_AGAIN.

Watch logs: `ssh ... 'tail -f /var/log/algovault-evaluate-venues.log'`.

---

## Step 5 — Manual promotion / retirement (when needed)

On day-30 second miss, Mr.1's decision options:

```bash
# Option A — manually promote (if WR is high enough to trust despite low sample)
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
  'docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -c \
  "UPDATE venues SET status='\''promoted'\'', promoted_at=NOW(), notes=COALESCE(notes,'\'''\'') || '\'' / manually promoted by Mr.1 <date>'\'' WHERE exchange_id='\''<VENUE>'\''"'

# Option B — retire (venue is structurally unsuitable; adapter stays but venue not routed)
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
  'docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -c \
  "UPDATE venues SET status='\''retired'\'', retired_at=NOW(), notes=COALESCE(notes,'\'''\'') || '\'' / retired by Mr.1 <date>: <reason>'\'' WHERE exchange_id='\''<VENUE>'\''"'

# Option C — reset extension counter to grant another auto-extend cycle (rare)
ssh ... 'docker exec ... -c "UPDATE venues SET extension_count=0 WHERE exchange_id='\''<VENUE>'\''"'
```

Container restart NOT required — the cron re-reads venues table on every fire.

---

## Failure modes + recovery

| Failure | Symptom | Recovery |
|---|---|---|
| Adapter throws on first seed cycle | Cron log shows `[seed-signals] <VENUE>: <error>` | Verify Plan-Mode probe step 1.b/1.c outputs; fix adapter bug; re-deploy. No venues-table mutation needed (cron retries next cycle). |
| `venues` row missing post-deploy | `getVenue('<VENUE>') === null`; envelope falls back to `'promoted'` default (backward-compat) | Re-run Step 3 seed INSERT manually. |
| `asset_count` snapshot drifted from venue's true catalog | Venue added N new listings; `min_buy_sell_sample` is now too low | Operator-only: `await refreshAssetCount('<VENUE>', <new-count>)` — re-computes `min_buy_sell_sample = newCount × 10`. NOT auto-bumped. |
| Cron job fails (postgres outage, OOM) | journalctl shows non-zero exit; Telegram silent | `systemctl status evaluate-venues.service` + check `/var/log/algovault-evaluate-venues.log`. Re-fire manually: `systemctl start evaluate-venues.service`. Cron is idempotent. |
| Telegram alert never arrives despite log saying `actions=N` | `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` missing/stale | Check `/opt/crypto-quant-signal-mcp/.env`; reload container env if rotated. `sendVenueStatusChange` silently no-ops if not configured (intentional — dev/test). |
| Day-30 manual_required alert ignored | Venue stuck at `shadow` past day-30; spamming daily alerts | The daily cron will re-fire the manual_required alert every day until status changes. Mr.1 should resolve via Step 5 within 7 days; if longer, mute the Telegram thread until decided. |
| Pilot venue collides with existing venue's symbol-naming | E.g. new venue uses `BTCUSDT-PERP` instead of `BTCUSDT` | Add to adapter's `SYMBOL_OVERRIDES` map; do NOT touch `TRADFI_ALIASES` (different semantics). |

---

## Verification gate before tagging the wave done

```bash
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
  "docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -c \"SELECT exchange_id, status, asset_count, min_buy_sell_sample FROM venues ORDER BY status, exchange_id\""

curl -sS https://api.algovault.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "mcp-session-id: $(./scripts/get-session-id.sh)" \
  -d '{"jsonrpc":"2.0","method":"resources/read","id":1,"params":{"uri":"mcp://algovault/venues"}}' \
  | jq '.result.contents[0].text | fromjson | .venues[] | {exchange_id, status}'

curl -sS https://api.algovault.com/api/performance-shadow | jq '.venues[].exchange_id'
```

Expected: new venue appears in all three views with `status='shadow'`.
