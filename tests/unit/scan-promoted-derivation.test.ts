/**
 * tests/unit/scan-promoted-derivation.test.ts — OPS-SCAN-UNIVERSE-EXPAND-W1.
 *
 * Single-derivation invariant: EVERY scan representation projects from EXCHANGES (capabilities.ts —
 * the one SoT), so promoting a venue there makes it appear in ALL of them. This is the synthetic guard
 * that the parallel hardcoded-5-list class cannot return (the FETCHERS Record is separately tsc-exhaustive).
 * The compile-time list ↔ runtime `listVenues('promoted')` DB parity is verified at C3 (live byExchange
 * count == EXCHANGE_COUNT) since it needs the live DB.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { EXCHANGES, PROMOTED_VENUE_IDS, EXCHANGE_COUNT } from '../../src/lib/capabilities.js';
import { SCAN_EXCHANGES } from '../../src/lib/trade-call-scanner.js';
import { SCAN_TRADE_CALLS_SCHEMA } from '../../src/tools/scan-trade-calls.js';
import { BAZAAR_ROUTES } from '../../src/lib/x402-bazaar.js';

const SOT = EXCHANGES.map((e) => e.id); // the single source: EXCHANGES ids, in order

describe('scan representations all derive from EXCHANGES (single SoT)', () => {
  it('PROMOTED_VENUE_IDS + EXCHANGE_COUNT project from EXCHANGES', () => {
    expect([...PROMOTED_VENUE_IDS]).toEqual(SOT);
    expect(EXCHANGE_COUNT).toBe(SOT.length);
    expect(SOT).toContain('ASTER'); // a newly-promoted venue is in the SoT
  });

  it('SCAN_EXCHANGES (trade-call-scanner) == the SoT', () => {
    expect([...SCAN_EXCHANGES]).toEqual(SOT);
  });

  it('the scan Zod exchange enum accepts exactly the promoted set', () => {
    const S = z.object(SCAN_TRADE_CALLS_SCHEMA);
    for (const v of SOT) expect(S.safeParse({ exchange: v }).success).toBe(true);
    expect(S.safeParse({ exchange: 'EDGEX' }).success).toBe(false); // configured-but-shadow → rejected
  });

  it('the x402 Bazaar scan_trade_calls exchange enum == the SoT', () => {
    const enumVals = (BAZAAR_ROUTES.scan_trade_calls as unknown as {
      inputSchema?: { properties?: { exchange?: { enum?: string[] } } };
    })?.inputSchema?.properties?.exchange?.enum;
    expect(enumVals).toEqual(SOT);
  });
});
