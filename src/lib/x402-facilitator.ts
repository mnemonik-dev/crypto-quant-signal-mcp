/**
 * FacilitatorAdapter — config-driven x402 facilitator selection + Bazaar discovery.
 * (X402-CDP-BAZAAR-DISCOVERY-W1)
 *
 * Generator-level seam: which facilitator (verify/settle target) and whether to
 * declare CDP Bazaar discovery metadata become CONFIG, not hard-coded — retiring
 * "which discovery layer / which facilitator" as a recurring code change. Future
 * cases inherit for free: Circle dual-listing, new CDP networks, any new facilitator.
 *
 * Two-flag firewall:
 *   - X402_FACILITATOR ∈ {legacy, cdp}    (default 'legacy')
 *       legacy = the CURRENT self-hosted facilitator sidecar reached via
 *       X402_FACILITATOR_URL (http://facilitator:4022 in prod). BYTE-IDENTICAL to
 *       pre-wave behavior. (The value 'legacy' replaces the spec's 'x402org' — prod
 *       never used the public x402.org facilitator; live probe 2026-05-29 + Cowork A1.)
 *   - BAZAAR_DISCOVERABLE ∈ {true,false}  (default false)
 *       Declares Bazaar metadata ONLY when true AND the facilitator resolves to cdp.
 *
 * Stub-first: if X402_FACILITATOR=cdp but CDP_API_KEY_ID/CDP_API_KEY_SECRET are
 * absent, the factory FALLS BACK to legacy and logs [STUB] — the wave ships
 * regardless of whether the CDP key has been minted.
 */
import { HTTPFacilitatorClient } from '@x402/core/server';
import type { FacilitatorConfig } from '@x402/core/server';
import { createFacilitatorConfig } from '@coinbase/x402';

export type FacilitatorChoice = 'legacy' | 'cdp';

/** Canonical CDP x402 facilitator base (verify/settle + discovery). */
export const CDP_FACILITATOR_URL = 'https://api.cdp.coinbase.com/platform/v2/x402';

/** Minimal env surface the adapter reads (injectable for tests). */
export interface FacilitatorEnv {
  X402_FACILITATOR?: string;
  X402_FACILITATOR_URL?: string;
  BAZAAR_DISCOVERABLE?: string;
  CDP_API_KEY_ID?: string;
  CDP_API_KEY_SECRET?: string;
}

export interface FacilitatorAdapterConfig {
  /** Requested facilitator (parsed; before stub-fallback). */
  choice: FacilitatorChoice;
  /** X402_FACILITATOR_URL — the self-hosted sidecar in prod. */
  legacyFacilitatorUrl?: string;
  /** BAZAAR_DISCOVERABLE flag (requested). */
  bazaarRequested: boolean;
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
}

export interface ResolvedFacilitator {
  /** Facilitator actually used after stub-fallback. */
  effectiveChoice: FacilitatorChoice;
  /** Whether Bazaar discovery metadata should be declared on routes. */
  discoveryEnabled: boolean;
  /** True when cdp was requested but keys were missing → fell back to legacy. */
  stubFellBack: boolean;
  /**
   * Config to pass to `new HTTPFacilitatorClient(...)`.
   * `undefined` reproduces the SDK default exactly (legacy, no URL set).
   */
  facilitatorConfig: FacilitatorConfig | undefined;
}

export function parseFacilitatorChoice(raw: string | undefined): FacilitatorChoice {
  return raw?.trim().toLowerCase() === 'cdp' ? 'cdp' : 'legacy';
}

export function parseBazaarFlag(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === 'true';
}

/** Read the adapter config from env (defaults: legacy + discovery off). */
export function resolveFacilitatorAdapterConfig(
  env: FacilitatorEnv = process.env,
): FacilitatorAdapterConfig {
  return {
    choice: parseFacilitatorChoice(env.X402_FACILITATOR),
    legacyFacilitatorUrl: env.X402_FACILITATOR_URL || undefined,
    bazaarRequested: parseBazaarFlag(env.BAZAAR_DISCOVERABLE),
    cdpApiKeyId: env.CDP_API_KEY_ID || undefined,
    cdpApiKeySecret: env.CDP_API_KEY_SECRET || undefined,
  };
}

/**
 * PURE decision — no client construction, no logging. Applies the two-flag
 * firewall + stub-fallback rules. This is the unit-test seam.
 */
export function selectFacilitator(cfg: FacilitatorAdapterConfig): ResolvedFacilitator {
  const cdpKeysPresent = Boolean(cfg.cdpApiKeyId && cfg.cdpApiKeySecret);
  const wantsCdp = cfg.choice === 'cdp';
  const stubFellBack = wantsCdp && !cdpKeysPresent;
  const effectiveChoice: FacilitatorChoice = wantsCdp && cdpKeysPresent ? 'cdp' : 'legacy';
  // Discovery only when we actually settle through CDP AND the inner flag is on.
  const discoveryEnabled = effectiveChoice === 'cdp' && cfg.bazaarRequested;

  let facilitatorConfig: FacilitatorConfig | undefined;
  if (effectiveChoice === 'cdp') {
    // createFacilitatorConfig returns the exact @x402/core/http FacilitatorConfig
    // ({ url: CDP_FACILITATOR_URL, createAuthHeaders }) — no shim required.
    facilitatorConfig = createFacilitatorConfig(cfg.cdpApiKeyId!, cfg.cdpApiKeySecret!);
  } else {
    // legacy: preserve EXACT current behavior — { url } only when set, else undefined.
    facilitatorConfig = cfg.legacyFacilitatorUrl ? { url: cfg.legacyFacilitatorUrl } : undefined;
  }

  return { effectiveChoice, discoveryEnabled, stubFellBack, facilitatorConfig };
}

/**
 * Construct the facilitator client for a resolved selection. Logs [STUB] on
 * stub-fallback so the dark/un-keyed case is observable in logs.
 */
export function createFacilitatorClient(resolved: ResolvedFacilitator): HTTPFacilitatorClient {
  if (resolved.stubFellBack) {
    console.warn(
      '[STUB] CDP facilitator selected (X402_FACILITATOR=cdp) but CDP_API_KEY_ID/CDP_API_KEY_SECRET missing — ' +
        'using legacy facilitator (X402_FACILITATOR_URL). Bazaar discovery disabled.',
    );
  }
  return new HTTPFacilitatorClient(resolved.facilitatorConfig);
}

/** Convenience: resolve straight from env (used by initX402). */
export function resolveFacilitatorFromEnv(env: FacilitatorEnv = process.env): ResolvedFacilitator {
  return selectFacilitator(resolveFacilitatorAdapterConfig(env));
}
