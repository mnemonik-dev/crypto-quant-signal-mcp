import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import {
  BAZAAR_ROUTES,
  declareBazaarRoute,
  isDiscoverableTool,
  assertNoBazaarLeak,
  FORBIDDEN_BAZAAR_TOKENS,
} from '../src/lib/x402-bazaar.js';
import { TOOL_PRICING } from '../src/lib/x402.js';

describe('Bazaar discovery routes', () => {
  it('declares exactly the paid tools (stays in sync with TOOL_PRICING)', () => {
    expect(Object.keys(BAZAAR_ROUTES).sort()).toEqual(Object.keys(TOOL_PRICING).sort());
  });

  it('get_trade_call is NOT discoverable (intentionally free — Cowork A2)', () => {
    expect(isDiscoverableTool('get_trade_call')).toBe(false);
    expect(declareBazaarRoute('get_trade_call')).toEqual({});
  });

  it('every route input example validates against its own declared inputSchema (strict)', () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    for (const spec of Object.values(BAZAAR_ROUTES)) {
      const validate = ajv.compile(spec.inputSchema);
      const ok = validate(spec.example);
      expect(ok, `${spec.toolName} example invalid: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('declareBazaarRoute returns a non-empty bazaar extension for each paid tool', () => {
    for (const tool of Object.keys(BAZAAR_ROUTES)) {
      const ext = declareBazaarRoute(tool);
      expect(Object.keys(ext).length).toBeGreaterThan(0);
    }
  });

  it('no Data-Integrity leak in any route description/example/output', () => {
    for (const spec of Object.values(BAZAAR_ROUTES)) {
      expect(() => assertNoBazaarLeak(spec, `route ${spec.toolName}`)).not.toThrow();
      // declared extension also clean
      expect(() => declareBazaarRoute(spec.toolName)).not.toThrow();
    }
  });

  it('leak guard throws on every forbidden internal token', () => {
    expect(() => assertNoBazaarLeak({ description: 'leak outcome_return_pct here' }, 'test')).toThrow(/leak/i);
    for (const token of FORBIDDEN_BAZAAR_TOKENS) {
      expect(() => assertNoBazaarLeak({ x: `prefix ${token} suffix` }, 'test')).toThrow();
    }
  });

  it('descriptions are outcome-framed (non-trivial length, no bare endpoint name)', () => {
    for (const spec of Object.values(BAZAAR_ROUTES)) {
      expect(spec.description.length).toBeGreaterThan(80);
      expect(spec.description).not.toBe(spec.toolName);
    }
  });
});
