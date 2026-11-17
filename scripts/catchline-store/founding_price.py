#!/usr/bin/env python3
"""Raise the Founding seat's price when the launch seats are gone.

The paywall says "N left at this price" for the first 100 founding seats (FOUNDING_LAUNCH_SEATS in
src/features/paywall/entitlements.ts). This keeps that promise: once `--at` seats are taken, the App Store price of
catchline_founding_lifetime moves from the launch price to `--to` (USD; Apple equalises the other countries).

  python3 scripts/catchline-store/founding_price.py [--at 100] [--to 49.99] [--go]

Without --go it only reports. It is safe to run every hour: it does nothing once the price is already `--to`.
Seats come from the public founding_seats() RPC (.secrets/catchline/project_ref.txt and publishable_key.txt).
Prints one line starting with STATE= for the job that runs it: wait | near | raise | raised | done.
"""
import argparse, json, sys, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from asc_replace import ASC, REPO  # noqa: E402

APP = "6785406082"
PRODUCT = "catchline_founding_lifetime"


def seats():
    ref = (REPO / ".secrets/catchline/project_ref.txt").read_text().strip()
    key = (REPO / ".secrets/catchline/publishable_key.txt").read_text().strip()
    req = urllib.request.Request(f"https://{ref}.supabase.co/rest/v1/rpc/founding_seats", data=b"{}", method="POST",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read())
    return int(d["taken"]), int(d["cap"])


def get(c, path):
    s, d = c.call("GET", path)
    if s >= 300:
        raise SystemExit(f"GET {path}: {s} {json.dumps(d.get('errors', d))[:400]}")
    return d


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--at", type=int, default=100)
    a.add_argument("--to", default="49.99")
    a.add_argument("--go", action="store_true")
    args = a.parse_args()
    taken, cap = seats()
    c = ASC(True)
    iap = get(c, f"/v1/apps/{APP}/inAppPurchasesV2?filter[productId]={PRODUCT}")["data"][0]["id"]
    sched = get(c, f"/v2/inAppPurchases/{iap}/iapPriceSchedule?include=baseTerritory,manualPrices")
    base = sched["data"]["relationships"]["baseTerritory"]["data"]["id"]
    prices = get(c, f"/v1/inAppPurchasePriceSchedules/{sched['data']['id']}/manualPrices?include=inAppPurchasePricePoint,territory&limit=50")
    points = {x["id"]: x["attributes"] for x in prices.get("included", []) if x["type"] == "inAppPurchasePricePoints"}
    now = None
    for p in prices["data"]:
        if p["relationships"]["territory"]["data"]["id"] == base and p["attributes"].get("endDate") is None:
            now = points[p["relationships"]["inAppPurchasePricePoint"]["data"]["id"]]["customerPrice"]
    print(f"seats {taken}/{cap}; base territory {base}; price now {now}; raise to {args.to} at {args.at} seats")
    if now is not None and float(now) >= float(args.to):
        print("STATE=done")
        return
    if taken < args.at:
        print("STATE=near" if taken >= args.at - 10 else "STATE=wait")
        return
    target = None
    url = f"/v2/inAppPurchases/{iap}/pricePoints?filter[territory]={base}&limit=200"
    while url and target is None:
        page = get(c, url)
        target = next((x["id"] for x in page["data"] if x["attributes"]["customerPrice"] == args.to), None)
        url = page.get("links", {}).get("next")
    if target is None:
        raise SystemExit(f"no {base} price point at {args.to}")
    if not args.go:
        print(f"would set price point {target}\nSTATE=raise")
        return
    s, d = c.call("POST", "/v1/inAppPurchasePriceSchedules", {
        "data": {"type": "inAppPurchasePriceSchedules", "relationships": {
            "inAppPurchase": {"data": {"type": "inAppPurchases", "id": iap}},
            "baseTerritory": {"data": {"type": "territories", "id": base}},
            "manualPrices": {"data": [{"type": "inAppPurchasePrices", "id": "${p1}"}]}}},
        "included": [{"type": "inAppPurchasePrices", "id": "${p1}", "attributes": {"startDate": None},
                      "relationships": {"inAppPurchasePricePoint": {"data": {"type": "inAppPurchasePricePoints", "id": target}}}}]})
    if s >= 300:
        raise SystemExit(f"price change failed: {s} {json.dumps(d.get('errors', d))[:600]}")
    print("STATE=raised")


if __name__ == "__main__":
    main()
