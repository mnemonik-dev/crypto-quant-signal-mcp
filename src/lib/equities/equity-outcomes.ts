/**
 * EQUITIES-ENGINE-W1 — pure PFE/outcome computation from stored bars.
 *
 * No Databento call (the nightly outcomes job reads only equity_bars_daily).
 * PFE (Peak Favorable Excursion) is entry-anchored and signed exactly like the
 * crypto engine: BUY tracks the highest high, SELL the lowest low; win = BUY
 * pfe>0 / SELL pfe<0. outcome_return_pct (close-to-close) is INTERNAL ONLY.
 * Default-deny on NaN / non-positive prices (returns null).
 */
export interface OutcomeBar { high: number; low: number; close: number; }

export interface PfeOutcome {
  pfe_pct: number;            // signed favorable-excursion %, entry-anchored
  outcome_return_pct: number; // INTERNAL — close-to-close return %, never exposed
}

/**
 * @param entry  close on the verdict session
 * @param window the `horizon` sessions AFTER the verdict session (chronological)
 * @param call   BUY or SELL (HOLD verdicts get no outcome)
 */
export function computePfeOutcome(entry: number, window: OutcomeBar[], call: 'BUY' | 'SELL'): PfeOutcome | null {
  if (!(entry > 0) || window.length === 0) return null;
  let pfePrice = entry;
  for (const b of window) {
    if (!Number.isFinite(b.high) || !Number.isFinite(b.low)) return null;
    if (call === 'BUY') {
      if (b.high > pfePrice) pfePrice = b.high;
    } else {
      if (b.low < pfePrice) pfePrice = b.low;
    }
  }
  const outcomePrice = window[window.length - 1].close;
  if (!(outcomePrice > 0)) return null;
  return {
    pfe_pct: ((pfePrice - entry) / entry) * 100,
    outcome_return_pct: ((outcomePrice - entry) / entry) * 100,
  };
}
