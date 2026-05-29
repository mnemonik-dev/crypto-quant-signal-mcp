#!/usr/bin/env node
/**
 * OPS-TRACK-TOKEN-STDIO-CLIENT-WRAPPER-W1 R2 — channel-attribution report.
 *
 * Internal-only, READ-ONLY. Prints the per-channel install breakdown from
 * `funnel_events` rows that carry a `track_token` in `meta_json`. Every
 * public install snippet embeds `X-AlgoVault-Track-Token:<slug>`; the C6
 * middleware (src/index.ts + src/lib/track-token.ts, TG-BROADCAST-STACK-W1
 * CH6) records ONE `funnel_events` row per `(session_id, token)` on the
 * first `tools/call`. This report reads those rows back, grouped by slug.
 *
 * Path α — run inside the mcp-server container where DATABASE_URL is set
 * (DB name `signal_performance`, from the compose .env):
 *
 *   docker exec crypto-quant-signal-mcp-mcp-server-1 \
 *     node /app/scripts/funnel-by-channel.mjs
 *
 * NOTE: `meta_json` is a TEXT column (portable across PG + SQLite). On
 * Postgres the `->>` / `?` JSON operators require a `::jsonb` cast first —
 * omitting it errors ("operator does not exist: text ->> unknown"). The
 * cast below was verified live in R0(d).
 *
 * No public surface. No writes. No `outcome_return_pct`. Read-only SELECT.
 */
import pg from 'pg';

const { Pool } = pg;

const CHANNEL_QUERY = `
  SELECT meta_json::jsonb->>'track_token' AS channel,
         COUNT(DISTINCT session_id)        AS installs,
         COUNT(*)                          AS first_calls,
         MIN(ts)                           AS first_seen,
         MAX(ts)                           AS last_seen
  FROM funnel_events
  WHERE event_type = 'first_tool_call_with_track_token'
    AND meta_json::jsonb ? 'track_token'
  GROUP BY 1
  ORDER BY installs DESC, channel ASC;
`;

function isoMin(ts) {
  try {
    return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return String(ts);
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      '[funnel-by-channel] DATABASE_URL not set — run inside the mcp-server ' +
        'container (Path α): docker exec crypto-quant-signal-mcp-mcp-server-1 ' +
        'node /app/scripts/funnel-by-channel.mjs',
    );
    process.exit(2);
  }

  const pool = new Pool({ connectionString });
  try {
    const { rows } = await pool.query(CHANNEL_QUERY);

    if (rows.length === 0) {
      console.log('Channel-attribution — installs by acquisition surface');
      console.log('');
      console.log('No channel-attributed installs yet (0 funnel_events rows with a track_token).');
      console.log('Channels populate as users install via a snippet carrying');
      console.log('X-AlgoVault-Track-Token:<slug> (chan-docs, chan-email, chan-welcome,');
      console.log('chan-readme, int-claude-desktop, int-claude-code, int-cursor, int-cline).');
      return;
    }

    const channelWidth = Math.max(7, ...rows.map((r) => String(r.channel ?? '(none)').length));
    const pad = (s, n) => String(s).padEnd(n);

    console.log('Channel-attribution — installs by acquisition surface');
    console.log('(distinct sessions per X-AlgoVault-Track-Token slug)');
    console.log('');
    console.log(
      pad('channel', channelWidth) +
        '  installs  first_calls  first_seen           last_seen',
    );
    console.log(
      '-'.repeat(channelWidth) +
        '  --------  -----------  -------------------  -------------------',
    );

    let totalInstalls = 0;
    for (const r of rows) {
      totalInstalls += Number(r.installs);
      console.log(
        pad(r.channel ?? '(none)', channelWidth) +
          '  ' +
          pad(r.installs, 8) +
          '  ' +
          pad(r.first_calls, 11) +
          '  ' +
          pad(isoMin(r.first_seen), 19) +
          '  ' +
          isoMin(r.last_seen),
      );
    }
    console.log('-'.repeat(channelWidth) + '  --------');
    console.log(
      pad('TOTAL', channelWidth) +
        '  ' +
        `${totalInstalls} installs across ${rows.length} channel(s)`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[funnel-by-channel] FATAL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
