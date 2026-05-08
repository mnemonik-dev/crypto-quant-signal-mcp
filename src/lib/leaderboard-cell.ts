/**
 * Leaderboard-cell trim helper.
 *
 * v1.10.0 C4: introduced — converts a full internal `GridCell` (which
 * carries leaky `signal` / `exchange` / `regime` fields used by the
 * cross-asset scorer) into the public-facing trimmed `LeaderboardCell`
 * shape `{coin, timeframe, confidence}`.
 *
 * v1.10.8 BOT-ALERT-IMAGE-W1 (2026-05-08): re-added `exchange` so the bot's
 * "See Also" surface can suggest same-TF + SAME-EXCHANGE trades (users want
 * to act on suggestions on the venue they already trade on). Direction
 * (`signal`) and macro context (`regime`) remain stripped — those are still
 * the actionability seams that drive the follow-up `get_trade_call`.
 *
 * Used by the `also_see` (cross-asset leads) and `closest_tradeable`
 * (HOLD-rescue) fields on `TradeCallResult`.
 */
import type { GridCell, LeaderboardCell } from '../types.js';

export function trimToLeaderboardCell(c: GridCell): LeaderboardCell {
  return {
    coin: c.coin,
    timeframe: c.timeframe,
    confidence: c.confidence,
    exchange: c.exchange,
  };
}
