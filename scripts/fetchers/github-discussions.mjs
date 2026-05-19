// scripts/fetchers/github-discussions.mjs
// BUNDLE-EXPAND-BLOG-W1 (C1, 2026-05-19) — fetch AlgoVaultLabs/crypto-quant-signal-mcp
// GitHub Discussions via the GraphQL API.
//
// Auth: prefers raw GraphQL `fetch` with a Bearer token from $GH_TOKEN or
// $GITHUB_TOKEN env var (so the container — which is node:20-alpine and does
// NOT include the `gh` CLI — can authenticate); falls back to spawning the
// operator-local `gh` CLI if env vars are absent AND the binary is present
// (for the local-dev / smoke-test path).
//
// Graceful-degradation contract: returns [] + WARNING log on any error path.
// Never throws — preserves the Promise.allSettled() invariant in the cron orchestrator.

import { execFileSync } from 'node:child_process';

const sourceType = 'github_discussion';

const QUERY = `
  query {
    repository(owner: "AlgoVaultLabs", name: "crypto-quant-signal-mcp") {
      discussions(first: 50, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes {
          number
          title
          url
          body
          createdAt
          category { name }
          author { login }
        }
      }
    }
  }
`.replace(/\s+/g, ' ').trim();

async function fetchViaApi(token) {
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AlgoVault-knowledge-bundle/1.0',
      },
      body: JSON.stringify({ query: QUERY }),
    });
    if (!res.ok) {
      console.warn(`[fetcher:github_discussion] GraphQL HTTP ${res.status} — returning []`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(
      `[fetcher:github_discussion] GraphQL fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function fetchViaCli() {
  try {
    const out = execFileSync('gh', ['api', 'graphql', '-f', `query=${QUERY}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch (err) {
    console.warn(
      `[fetcher:github_discussion] gh api graphql failed (returning []): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

async function fetchAll() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  let json = null;
  if (token) {
    json = await fetchViaApi(token);
  } else {
    json = fetchViaCli();
  }
  const nodes = json?.data?.repository?.discussions?.nodes ?? [];
  const pages = nodes
    .filter((d) => typeof d?.title === 'string' && typeof d?.body === 'string' && d.body.trim().length > 50)
    .map((d) => ({
      source_type: sourceType,
      source_url: d.url,
      title: d.title,
      published_at: d.createdAt,
      content_markdown: d.body,
      author: d.author?.login ?? 'AlgoVault Labs',
      tags: d.category?.name ? [d.category.name] : [],
    }));

  console.log(`[fetcher:github_discussion] returning ${pages.length} pages`);
  return pages;
}

export default { sourceType, fetchAll };
