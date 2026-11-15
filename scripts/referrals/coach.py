#!/usr/bin/env python3
"""Coach codes and payouts for Catchline referrals (0025_referrals.sql).

  coach.py make <user-id> <CODE> [--go]   give a signed-in user a coach code and Pro for life
  coach.py payouts [--since YYYY-MM-DD]   30% of each coach's lifters' first-year proceeds

Reads .secrets/catchline/{url,service_role_key,revenuecat_secret_v1,revenuecat_secret_v2}.txt.
Without --go, make only prints what it would do. Payouts are paid outside Apple, by hand.
"""
import json
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SECRETS = Path.home() / "dev/parallax/.secrets/catchline"
if (REPO / ".secrets/catchline").exists():
    SECRETS = REPO / ".secrets/catchline"
RC_PROJECT = "6e597b8e"
SHARE = 0.30


def secret(name: str) -> str:
    return (SECRETS / name).read_text().strip()


def call(method: str, url: str, headers: dict, body=None):
    req = urllib.request.Request(url, method=method, headers={"Content-Type": "application/json", **headers},
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def supabase(method: str, path: str, body=None):
    key = secret("service_role_key.txt")
    return call(method, secret("url.txt") + path, {"apikey": key, "Authorization": f"Bearer {key}"}, body)


def make(user: str, code: str, go: bool) -> None:
    print(f"coach code {code} for {user}, and Pro for life on the pull entitlement")
    if not go:
        print("dry run: add --go to do it")
        return
    print(supabase("POST", "/rest/v1/rpc/admin_make_coach", {"p_user": user, "p_code": code}))
    call("POST", f"https://api.revenuecat.com/v1/subscribers/{user}/entitlements/pull/promotional",
         {"Authorization": f"Bearer {secret('revenuecat_secret_v1.txt')}"}, {"duration": "lifetime"})
    print("Pro for life granted")


def payouts(since: str | None) -> None:
    rows = supabase("GET", "/rest/v1/referrals?select=referrer_id,referee_id,claimed_at,code&kind=eq.coach")
    v2 = {"Authorization": f"Bearer {secret('revenuecat_secret_v2.txt')}"}
    totals: dict[str, dict] = {}
    for r in rows:
        claimed = datetime.fromisoformat(r["claimed_at"])
        end = claimed + timedelta(days=365)
        subs = call("GET", f"https://api.revenuecat.com/v2/projects/{RC_PROJECT}/customers/{r['referee_id']}/subscriptions", v2)
        proceeds = 0.0
        for s in subs.get("items", []):
            started = datetime.fromtimestamp(s["starts_at"] / 1000, tz=timezone.utc)
            if s.get("environment") != "production" or not (claimed <= started <= end):
                continue
            if since and started < datetime.fromisoformat(since).replace(tzinfo=timezone.utc):
                continue
            proceeds += float(((s.get("total_revenue_in_usd") or {}).get("proceeds")) or 0)
        t = totals.setdefault(r["code"], {"coach": r["referrer_id"], "lifters": 0, "proceeds": 0.0})
        t["lifters"] += 1
        t["proceeds"] += proceeds
    if not totals:
        print("no coach referrals yet")
    for code, t in sorted(totals.items()):
        print(f"{code}\tcoach {t['coach']}\t{t['lifters']} lifters\tproceeds ${t['proceeds']:.2f}\towed ${t['proceeds'] * SHARE:.2f}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["make"] and len(args) >= 3:
        make(args[1], args[2].upper(), "--go" in args)
    elif args[:1] == ["payouts"]:
        payouts(args[args.index("--since") + 1] if "--since" in args else None)
    else:
        print(__doc__)
        sys.exit(2)
