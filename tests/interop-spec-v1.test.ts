/**
 * tests/interop-spec-v1.test.ts — INTEROP-SPEC-v1-W1 schema-validation suite
 *
 * Validates that the AlgoVault Verifiable-Signal v1.0 JSON Schema
 * (schemas/verifiable-signal-v1.json) correctly accepts a real, live-fetched
 * `get_trade_call` response reshaped into the canonical envelope (positive
 * test) and correctly rejects a deliberately-malformed copy (negative test).
 *
 * Run via:  npm run validate-spec
 *           # or: npx vitest run tests/interop-spec-v1.test.ts
 *
 * The deliberate breakage in `verifiable-signal-v1-malformed.json` sets
 * `composite_verdict.confidence` to the string "high" instead of a number in
 * [0.0, 1.0]. The negative test asserts ajv reports a `type` keyword error at
 * instancePath `/composite_verdict/confidence`.
 *
 * Audit reference: audits/INTEROP-SPEC-v1-W1-endpoint-truth.md (Plan-Mode
 * Q-row ratifications).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function loadJson(relPath: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, relPath), 'utf-8'));
}

const schema = loadJson('schemas/verifiable-signal-v1.json');
const sample = loadJson('tests/fixtures/verifiable-signal-v1-sample.json');
const malformed = loadJson('tests/fixtures/verifiable-signal-v1-malformed.json');

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema as object);

describe('AlgoVault Verifiable-Signal Interop Spec v1.0', () => {
  it('schema self-validation: compiles strictly under JSON Schema 2020-12', () => {
    // ajv.compile() above already threw if the schema was invalid.
    // This case documents the implicit assertion as a first-class test.
    expect(typeof validate).toBe('function');
  });

  it('positive: live-derived sample fixture validates with zero errors', () => {
    const ok = validate(sample);
    if (!ok) {
      // Surface ajv errors for debug visibility on CI failure.
      console.error('validation errors:', JSON.stringify(validate.errors, null, 2));
    }
    expect(ok).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('negative: malformed fixture fails with composite_verdict.confidence type error', () => {
    const ok = validate(malformed);
    expect(ok).toBe(false);
    expect(validate.errors).not.toBeNull();
    // Assert the specific deliberate-breakage error is present in the error list.
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: '/composite_verdict/confidence',
          keyword: 'type',
        }),
      ]),
    );
  });
});
