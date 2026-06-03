# www.algovault.com → apex redirect — MANUAL_PENDING (AI-CRAWLER-ACCESS-W2 R1)

**Status:** 🔴 `MANUAL_PENDING` — blocked on a Cloudflare API token. As of 2026-06-03 there is **no live `CLOUDFLARE_API_TOKEN`** on this machine or the Hetzner host (the April token at `/tmp/cf-blog-mapping/token.env` expired 2026-04-30). Code cannot diagnose the DNS record or create the redirect without it.

## Problem
`https://www.algovault.com/` → **HTTP 522** (Cloudflare can reach no origin for the `www` host; Caddy only serves the apex). `www` and apex resolve to the same proxied Cloudflare IPs (`104.21.64.189`, `172.67.187.95`). Apex `https://algovault.com/` is healthy and its canonical/og:url are clean apex (no `www`). External/old links to `www` 522, and the stale search index has a `www`-shaped parking snapshot — both hurt the citation-eligibility goal.

## The fix (preferred): edge `301 www → apex` Single Redirect
A Cloudflare Single Redirect is served at the edge **before** the request reaches the (broken) origin, so the 522 disappears entirely. This needs the token scope `Zone.Ruleset:Edit`.

### Option A — Cloudflare dashboard (4 clicks; anyone with dashboard access)
1. Cloudflare → select zone **algovault.com** → **Rules** → **Redirect Rules** → **Create rule**.
2. Name: `www-to-apex-301`. **When incoming requests match:** Field `Hostname` · Operator `equals` · Value `www.algovault.com`.
3. **Then:** *Static* → Type **301 (Permanent)** … *or* **Dynamic** → Expression `concat("https://algovault.com", http.request.uri.path)`, **Preserve query string** ✅.
4. **Deploy**. Verify: `curl -sI https://www.algovault.com/faq` → `301` → `location: https://algovault.com/faq` (no 522).

### Option B — Cloudflare API (Code can run this once a token is provisioned)
Provision a token (Mr.1): Cloudflare → My Profile → API Tokens → Create Token → Custom, scoped to `algovault.com`, perms **`Zone.DNS:Edit` + `Zone.Zone:Read` + `Zone.Ruleset:Edit`**. Deliver via one-time-secret. Then:

```bash
# 0. preflight: scope + zone id (account e0e991af09a7509a85b045a49049bbc3)
export CF="$CLOUDFLARE_API_TOKEN"
curl -fsS https://api.cloudflare.com/client/v4/user/tokens/verify \
  -H "Authorization: Bearer $CF" | jq '.result.status'           # → "active"
ZID=$(curl -fsS "https://api.cloudflare.com/client/v4/zones?name=algovault.com" \
  -H "Authorization: Bearer $CF" | jq -r '.result[0].id')

# 1. diagnose the www DNS record (DNS:Edit / Zone:Read)
curl -fsS "https://api.cloudflare.com/client/v4/zones/$ZID/dns_records?name=www.algovault.com" \
  -H "Authorization: Bearer $CF" | jq '.result[] | {id,type,content,proxied}'

# 2. (only if www has NO record) create a proxied CNAME www → apex so the host resolves.
#    DO NOT modify the apex record. Skip if a record already exists.
# curl -fsS -X POST "https://api.cloudflare.com/client/v4/zones/$ZID/dns_records" \
#   -H "Authorization: Bearer $CF" -H "Content-Type: application/json" \
#   -d '{"type":"CNAME","name":"www","content":"algovault.com","proxied":true}'

# 3. create the 301 Single Redirect (Ruleset:Edit) at the http_request_dynamic_redirect phase
curl -fsS -X PUT \
  "https://api.cloudflare.com/client/v4/zones/$ZID/rulesets/phases/http_request_dynamic_redirect/entrypoint" \
  -H "Authorization: Bearer $CF" -H "Content-Type: application/json" \
  -d '{
    "rules": [{
      "action": "redirect",
      "expression": "(http.host eq \"www.algovault.com\")",
      "action_parameters": {
        "from_value": {
          "status_code": 301,
          "target_url": { "expression": "concat(\"https://algovault.com\", http.request.uri.path)" },
          "preserve_query_string": true
        }
      },
      "description": "www-to-apex-301 (AI-CRAWLER-ACCESS-W2 R1)"
    }]
  }'

# 4. verify
curl -sI https://www.algovault.com/faq | grep -iE 'HTTP/|location'   # → 301 + location: https://algovault.com/faq
```
> ⚠️ Step 3 `PUT …/entrypoint` **replaces** the dynamic-redirect ruleset. If other redirect rules already exist in this phase, first `GET` the entrypoint and append to its `rules[]` rather than overwriting.

## Never
- Never modify the apex `algovault.com` DNS record.
- Never commit the token; reference `CLOUDFLARE_API_TOKEN` by env-var name only.

## Token request for Mr.1 (copy-paste)
> AI-CRAWLER-ACCESS-W2 R1 needs a Cloudflare API token to kill the `www` 522. Please create a Custom token scoped to **algovault.com** with **Zone.DNS:Edit + Zone.Zone:Read + Zone.Ruleset:Edit** and send it via one-time-secret. I'll run the diagnose→redirect→verify chain above and flip R1 to done. (Or do the 4-click dashboard redirect in Option A yourself — either closes R1.)
