#!/usr/bin/env python3
"""
x402-bazaar-canary.py — X402-CDP-BAZAAR-DISCOVERY-W1 (R5)

Weekly host-side canary: confirms AlgoVault's paid x402 routes remain listed in the
CDP x402 Bazaar (merchant-discovery endpoint). Alerts via send_telegram.sh ONLY on
SUSTAINED drop-out (absent >= ABSENT_THRESHOLD_WEEKS consecutive runs). Never alerts
on a single miss or a transient CDP error.

Gate delegation (per CLAUDE.md monitoring runbook — consumers MUST NOT re-implement
gates inline): severity-gate (CRITICAL_PERSISTENT only) + 24h cooldown + DRY_RUN_TG
+ OPS-<CLASS>-W{NEXT} template resolution all live in send_telegram.sh. This canary
owns ONLY the domain logic: probe + consecutive-absence counter + fail-open.

Automation-first: Detect (probe) -> Alert (sustained only) -> Escalate (operator
dispatches the resolved recommended wave). Recovery is n/a — a Bazaar listing is
earned by settle volume + recency, not re-pushed.

Install (host): /opt/algovault-monitoring/x402-bazaar-canary.py  (SoT: repo ops/monitoring/)
Cron (off-:00, weekly): 17 12 * * 3  (Wed 12:17 UTC)

Env:
  X402_BAZAAR_PAYTO        mainnet payTo to verify (default: 0x778A...d59)
  CDP_DISCOVERY_BASE       default https://api.cdp.coinbase.com/platform/v2/x402
  ABSENT_THRESHOLD_WEEKS   consecutive-absent runs before alert (default 2)
  DRY_RUN_CANARY=1         smoke: no state writes, sets DRY_RUN_TG for the wrapper
  CANARY_FORCE_ABSENT=1    (smoke) force the absent branch to exercise WOULD_FIRE
"""
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone

PAYTO = os.environ.get("X402_BAZAAR_PAYTO", "0x778A05280Fd8dB980E920fE9f31d0A8eAbD17d59")
BASE = os.environ.get("CDP_DISCOVERY_BASE", "https://api.cdp.coinbase.com/platform/v2/x402")
THRESHOLD = int(os.environ.get("ABSENT_THRESHOLD_WEEKS", "2"))
DRY_RUN = os.environ.get("DRY_RUN_CANARY", "0") == "1"
FORCE_ABSENT = os.environ.get("CANARY_FORCE_ABSENT", "0") == "1"
WRAPPER = "/opt/algovault-monitoring/send_telegram.sh"
STATE_DIR = "/var/lib/algovault-monitoring"
STATE_FILE = os.path.join(STATE_DIR, "x402-bazaar-canary-state.json")
ALERT_ID = "x402-bazaar-delist"
SEVERITY = "CRITICAL_PERSISTENT"
RECOMMENDED_WAVE = "OPS-X402-BAZAAR-DELIST-AUTOPILOT-W{NEXT}"


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    print(f"{now()} [x402-bazaar-canary] {msg}", flush=True)


def probe():
    """(reachable, listed_count). reachable=False => transient/error => fail-open (NOT a delisting)."""
    url = f"{BASE}/discovery/merchant?payTo={PAYTO}"
    try:
        req = urllib.request.Request(url, headers={"accept": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode())
        total = (data.get("pagination") or {}).get("total")
        if total is None:
            total = len(data.get("resources") or [])
        return True, int(total)
    except Exception as e:  # noqa: BLE001 — any failure is fail-open, never a false delist
        log(f"PROBE_ERROR (fail-open, not counted as absent): {e!r}")
        return False, 0


def load_state() -> dict:
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {"consecutive_absent": 0, "last_listed_at": None, "last_run_at": None}


def save_state(st: dict) -> None:
    if DRY_RUN:
        log(f"DRY_RUN: would persist state {st}")
        return
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(st, f)
    os.replace(tmp, STATE_FILE)


def fire(consecutive: int, count: int) -> None:
    body = (
        "\U0001F6D1 AlgoVault ABSENT from CDP x402 Bazaar\n"
        f"payTo: {PAYTO}\n"
        f"merchant-discovery total: {count} (expected >= 1)\n"
        f"consecutive weekly misses: {consecutive} (threshold {THRESHOLD})\n"
        "Impact: autonomous agents can no longer discover AlgoVault's paid routes "
        "via the CDP Bazaar / Agentic.Market.\n"
        f"Probe: GET {BASE}/discovery/merchant?payTo={PAYTO}\n"
        f"recommended_wave: {RECOMMENDED_WAVE}\n"
        "audit: audits/x402-cdp-bazaar-discovery-w1-endpoint-truth.md"
    )
    env = dict(os.environ)
    if DRY_RUN:
        env["DRY_RUN_TG"] = "1"  # wrapper logs DRY_RUN_FIRED but does NOT send
    try:
        subprocess.run(
            [WRAPPER, ALERT_ID, SEVERITY, "-"],
            input=body.encode(),
            env=env,
            check=False,
            timeout=30,
        )
    except Exception as e:  # noqa: BLE001 — wrapper missing/err must never crash the canary
        log(f"WRAPPER_ERROR (fail-open): {e!r}")


def main() -> int:
    st = load_state()
    reachable, count = probe()
    if FORCE_ABSENT:
        log("CANARY_FORCE_ABSENT=1 — forcing absent branch (smoke)")
        reachable, count = True, 0
    st["last_run_at"] = now()

    if not reachable:
        save_state(st)
        log("VERDICT: PROBE_UNREACHABLE (fail-open, exit 0)")
        return 0

    if count >= 1:
        st["consecutive_absent"] = 0
        st["last_listed_at"] = now()
        save_state(st)
        log(f"VERDICT: PROBE_OK — listed (resources={count})")
        return 0

    # absent: reachable AND total 0
    st["consecutive_absent"] = int(st.get("consecutive_absent", 0)) + 1
    save_state(st)
    if st["consecutive_absent"] >= THRESHOLD:
        log(
            f"VERDICT: WOULD_FIRE — absent {st['consecutive_absent']}x >= {THRESHOLD}; invoking wrapper "
            f"({'DRY_RUN_TG' if DRY_RUN else 'live'}; wrapper still gates severity+cooldown)"
        )
        fire(st["consecutive_absent"], count)
    else:
        log(f"VERDICT: ABSENT_BELOW_THRESHOLD ({st['consecutive_absent']}/{THRESHOLD}) — no alert yet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
