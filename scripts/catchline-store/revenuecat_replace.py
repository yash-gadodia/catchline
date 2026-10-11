#!/usr/bin/env python3
"""Set up Catchline in the existing (Parallax) RevenueCat project via REST API v2.

Dry run by default: reads, prints the plan, writes nothing. --apply writes. Idempotent.
Endpoint shapes checked against https://www.revenuecat.com/docs/api-v2 on 11-10-2026.

Needs a v2 SECRET key (sk_...) with project-configuration read/write and customer-information
read/write, saved at .secrets/revenuecat/secret_v2.txt. Public SDK keys (appl_/goog_) cannot do this.

Steps (--only to pick): apps, entitlements, products, offerings, grandfather
  apps          rename the iOS / Android apps to "Catchline (iOS)" / "Catchline (Android)".
                The v2 API has no project rename: rename the project in the dashboard.
  entitlements  hook, pull, platform, founding.
  products      every Catchline store product, attached to its entitlements (PRODUCTS.md).
                Also attaches the old Parallax lifetime product to hook/pull/founding, so any Apple ID
                that bought Parallax lifetime unlocks Founding on Restore Purchases.
  offerings     default (made Current, Pull packages first) and ad_trial (annual + monthly trial).
  grandfather   customers holding the old Parallax entitlement with no expiry (lifetime) get a
                promotional `founding` grant. Dry run prints the count only.

Usage:
  scripts/catchline-store/revenuecat_replace.py [--project-id proj...] [--apply] [--only offerings]
"""
import argparse, json, pathlib, sys, time, urllib.error, urllib.parse, urllib.request

REPO = pathlib.Path(__file__).resolve().parents[2]
KEY_PATH = REPO / ".secrets/revenuecat/secret_v2.txt"
API = "https://api.revenuecat.com/v2"
STEPS = ["apps", "entitlements", "products", "offerings", "grandfather"]
OLD_ENTITLEMENT = "Parallax Pro"
OLD_LIFETIME = "parallax_plus_lifetime"
PROMO_EXPIRES_MS = 4102444800000  # 2100-01-01: v2 grants need an expiry; this is "lifetime" in practice

ENTITLEMENTS = {"hook": "Hook", "pull": "Pull", "platform": "Platform", "founding": "Founding member"}
# store id -> (type, display name, entitlements, ios?, play?)
PRODUCTS = [
    ("catchline_hook_monthly", "subscription", "Hook monthly", ["hook"], "ios"),
    ("catchline_hook_annual", "subscription", "Hook annual", ["hook"], "ios"),
    ("catchline_pull_monthly", "subscription", "Pull monthly", ["hook", "pull"], "ios"),
    ("catchline_pull_annual", "subscription", "Pull annual", ["hook", "pull"], "ios"),
    ("catchline_pull_monthly_trial7", "subscription", "Pull monthly (7-day trial)", ["hook", "pull"], "ios"),
    ("catchline_pull_annual_trial7", "subscription", "Pull annual (7-day trial)", ["hook", "pull"], "ios"),
    ("catchline_platform_monthly", "subscription", "Platform monthly", ["hook", "pull", "platform"], "ios"),
    ("catchline_platform_annual", "subscription", "Platform annual", ["hook", "pull", "platform"], "ios"),
    ("catchline_founding_lifetime", "non_consumable", "Founding member", ["hook", "pull", "founding"], "ios"),
    ("catchline_hook:monthly", "subscription", "Hook monthly", ["hook"], "play"),
    ("catchline_hook:annual", "subscription", "Hook annual", ["hook"], "play"),
    ("catchline_pull:monthly", "subscription", "Pull monthly", ["hook", "pull"], "play"),
    ("catchline_pull:annual", "subscription", "Pull annual", ["hook", "pull"], "play"),
    ("catchline_pull:monthly-trial7", "subscription", "Pull monthly (7-day trial)", ["hook", "pull"], "play"),
    ("catchline_pull:annual-trial7", "subscription", "Pull annual (7-day trial)", ["hook", "pull"], "play"),
    ("catchline_platform:monthly", "subscription", "Platform monthly", ["hook", "pull", "platform"], "play"),
    ("catchline_platform:annual", "subscription", "Platform annual", ["hook", "pull", "platform"], "play"),
    ("catchline_founding_lifetime", "non_consumable", "Founding member", ["hook", "pull", "founding"], "play"),
    (OLD_LIFETIME, "non_consumable", "Parallax lifetime (grandfathered to Founding)", ["hook", "pull", "founding"], "ios"),
]
# offering -> (display name, current?, [(package, display, ios product, play product)])
OFFERINGS = {
    "default": ("Catchline", True, [
        ("pull_annual", "Pull annual", "catchline_pull_annual", "catchline_pull:annual"),
        ("pull_monthly", "Pull monthly", "catchline_pull_monthly", "catchline_pull:monthly"),
        ("hook_monthly", "Hook monthly", "catchline_hook_monthly", "catchline_hook:monthly"),
        ("hook_annual", "Hook annual", "catchline_hook_annual", "catchline_hook:annual"),
        ("platform_monthly", "Platform monthly", "catchline_platform_monthly", "catchline_platform:monthly"),
        ("platform_annual", "Platform annual", "catchline_platform_annual", "catchline_platform:annual"),
        ("founding", "Founding member", "catchline_founding_lifetime", "catchline_founding_lifetime"),
    ]),
    "ad_trial": ("Ad funnel: Pull with 7-day trial", False, [
        ("$rc_annual", "Annual", "catchline_pull_annual_trial7", "catchline_pull:annual-trial7"),
        ("$rc_monthly", "Monthly", "catchline_pull_monthly_trial7", "catchline_pull:monthly-trial7"),
    ]),
}


class Blocked(Exception):
    pass


class RC:
    def __init__(self, apply):
        self.apply = apply
        self.fake = 0
        if not KEY_PATH.exists():
            raise Blocked(f"no RevenueCat v2 secret key at {KEY_PATH.relative_to(REPO)}. Create one in RevenueCat > "
                          "Project settings > API keys > + New secret API key (v2, read/write on project configuration "
                          "and customer information), save it to that file (chmod 600) and re-run.")
        self.key = KEY_PATH.read_text().strip()
        if not self.key.startswith("sk_"):
            raise Blocked(f"{KEY_PATH.relative_to(REPO)} does not hold a secret key (expected sk_...); "
                          "public SDK keys (appl_/goog_) cannot configure the project")

    def call(self, method, path, body=None):
        url = path if path.startswith("http") else API + path
        req = urllib.request.Request(url, method=method)
        req.add_header("Authorization", f"Bearer {self.key}")
        data = None
        if body is not None:
            req.add_header("Content-Type", "application/json")
            data = json.dumps(body).encode()
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, data, timeout=60) as r:
                    raw = r.read()
                    return r.status, json.loads(raw) if raw else {}
            except urllib.error.HTTPError as e:
                raw = e.read()
                doc = json.loads(raw) if raw.strip().startswith(b"{") else {}
                if e.code == 429 and attempt < 4:
                    time.sleep(float(e.headers.get("Retry-After") or 5))
                    continue
                if e.code in (401, 403):
                    raise Blocked(f"RevenueCat returned {e.code} on {method} {path}: {doc.get('message', '')}. "
                                  "Check the v2 secret key and its permissions.")
                return e.code, doc

    def get(self, path):
        status, doc = self.call("GET", path)
        if status >= 400:
            raise RuntimeError(f"GET {path} -> {status}: {doc.get('message', doc)}")
        return doc

    def get_all(self, path):
        items, url = [], path + ("&" if "?" in path else "?") + "limit=100"
        while url:
            doc = self.get(url)
            items += doc.get("items", [])
            nxt = doc.get("next_page")
            url = (API + nxt[3:] if nxt.startswith("/v2") else nxt) if nxt else None
        return items

    def write(self, method, path, body, what):
        if not self.apply:
            print(f"    [plan] {method} {path}  {what}")
            self.fake += 1
            return {"id": f"DRYRUN-{self.fake}"}
        status, doc = self.call(method, path, body)
        if status >= 400:
            raise RuntimeError(f"{method} {path} -> {status}: {doc.get('message', doc)}")
        print(f"    [done] {method} {path}  {what}")
        return doc


def dry(i):
    return str(i).startswith("DRYRUN-")


class Run:
    def __init__(self, rc, project):
        self.rc, self.p = rc, f"/projects/{project}"
        apps = rc.get_all(f"{self.p}/apps")
        self.ios = next((a for a in apps if a["type"] == "app_store"), None)
        self.play = next((a for a in apps if a["type"] == "play_store"), None)
        print("  apps: " + ", ".join(f"{a['name']!r} ({a['type']}, {a['id']})" for a in apps))
        if not self.ios:
            raise Blocked("project has no App Store app; add it in the dashboard (bundle com.yashgadodia.parallax)")
        self.ents = {e["lookup_key"]: e for e in rc.get_all(f"{self.p}/entitlements")}
        self.products = {(p["store_identifier"], p["app_id"]): p for p in rc.get_all(f"{self.p}/products")}

    def app_for(self, store):
        return self.ios if store == "ios" else self.play

    def apps(self):
        for app, name in ((self.ios, "Catchline (iOS)"), (self.play, "Catchline (Android)")):
            if app and app["name"] != name:
                self.rc.write("POST", f"{self.p}/apps/{app['id']}", {"name": name}, f"rename app {app['name']!r} -> {name!r}")
        print("  project rename: not in the v2 API; rename it to 'Catchline' in the dashboard")

    def entitlements(self):
        for key, name in ENTITLEMENTS.items():
            if key in self.ents:
                print(f"  entitlement {key} exists ({self.ents[key]['id']})")
            else:
                self.ents[key] = self.rc.write("POST", f"{self.p}/entitlements", {"lookup_key": key, "display_name": name},
                                               f"create entitlement {key}")
        if OLD_ENTITLEMENT in self.ents:
            print(f"  old entitlement {OLD_ENTITLEMENT!r} kept (Parallax receipts still map to it)")

    def products_step(self):
        attach = {}
        for sid, type_, name, ents, store in PRODUCTS:
            app = self.app_for(store)
            if not app:
                print(f"  skip {sid} ({store}): no Play app in this project yet")
                continue
            prod = self.products.get((sid, app["id"]))
            if prod:
                print(f"  product {sid} [{store}] exists ({prod['id']})")
            elif sid == OLD_LIFETIME:
                print(f"  {OLD_LIFETIME} not in RevenueCat; creating it so Parallax receipts map to Founding")
                prod = self.rc.write("POST", f"{self.p}/products",
                                     {"store_identifier": sid, "app_id": app["id"], "type": type_, "display_name": name},
                                     f"create product {sid}")
            else:
                prod = self.rc.write("POST", f"{self.p}/products",
                                     {"store_identifier": sid, "app_id": app["id"], "type": type_, "display_name": name},
                                     f"create {type_} {sid} [{store}]")
            self.products[(sid, app["id"])] = prod
            for e in ents:
                attach.setdefault(e, []).append((sid, prod["id"]))
        for key, prods in attach.items():
            ent = self.ents.get(key)
            have = set() if not ent or dry(ent["id"]) else {p["id"] for p in self.rc.get_all(f"{self.p}/entitlements/{ent['id']}/products")}
            todo = [(s, i) for s, i in prods if i not in have]
            if not todo:
                print(f"  entitlement {key}: products already attached")
                continue
            ent_id = ent["id"] if ent else f"<{key}>"
            for i in range(0, len(todo), 50):
                chunk = todo[i:i + 50]
                self.rc.write("POST", f"{self.p}/entitlements/{ent_id}/actions/attach_products",
                              {"product_ids": [pid for _, pid in chunk]},
                              f"attach to {key}: {', '.join(s for s, _ in chunk)}")

    def offerings(self):
        existing = {o["lookup_key"]: o for o in self.rc.get_all(f"{self.p}/offerings")}
        for key, (name, current, packages) in OFFERINGS.items():
            off = existing.get(key)
            if off:
                print(f"  offering {key} exists ({off['id']}), current={off.get('is_current')}")
            else:
                off = self.rc.write("POST", f"{self.p}/offerings", {"lookup_key": key, "display_name": name}, f"create offering {key}")
            if current and not off.get("is_current"):
                self.rc.write("POST", f"{self.p}/offerings/{off['id']}", {"is_current": True}, f"make {key} the Current offering")
            pkgs = {} if dry(off["id"]) else {p["lookup_key"]: p for p in self.rc.get_all(f"{self.p}/offerings/{off['id']}/packages")}
            wanted = {p[0] for p in packages}
            foreign = [k for k in pkgs if k not in wanted]
            if foreign:
                print(f"    note: {key} also has packages {foreign} (Parallax). Left in place; the app ignores them. "
                      "Delete them in the dashboard once no Parallax build reads this offering.")
            for pos, (pkg, pname, ios_sid, play_sid) in enumerate(packages, 1):
                pk = pkgs.get(pkg) or self.rc.write("POST", f"{self.p}/offerings/{off['id']}/packages",
                                                    {"lookup_key": pkg, "display_name": pname, "position": pos},
                                                    f"create package {key}/{pkg} at position {pos}")
                have = set() if dry(pk["id"]) else {p["id"] for p in self.rc.get_all(f"{self.p}/packages/{pk['id']}/products")}
                todo = []
                for store, sid in (("ios", ios_sid), ("play", play_sid)):
                    app = self.app_for(store)
                    prod = app and self.products.get((sid, app["id"]))
                    if prod and prod["id"] not in have:
                        todo.append((sid, prod["id"]))
                    elif app and not prod:
                        print(f"    warn: product {sid} [{store}] missing; run the products step first")
                if todo:
                    self.rc.write("POST", f"{self.p}/packages/{pk['id']}/actions/attach_products",
                                  {"products": [{"product_id": i, "eligibility_criteria": "all"} for _, i in todo]},
                                  f"attach {', '.join(s for s, _ in todo)} to {key}/{pkg}")

    def grandfather(self):
        old = self.ents.get(OLD_ENTITLEMENT)
        if not old:
            print(f"  no {OLD_ENTITLEMENT!r} entitlement in this project; nothing to grandfather")
            return
        founding = self.ents.get("founding")
        lifetime, scanned = [], 0
        for c in self.rc.get_all(f"{self.p}/customers"):
            scanned += 1
            active = c.get("active_entitlements")
            if active is None:
                active = self.rc.get(f"{self.p}/customers/{urllib.parse.quote(c['id'], safe='')}").get("active_entitlements", {})
            items = active.get("items", []) if isinstance(active, dict) else active
            ids = {i["entitlement_id"]: i.get("expires_at") for i in items}
            if old["id"] in ids and ids[old["id"]] is None:
                lifetime.append((c["id"], founding and founding["id"] in ids))
        todo = [cid for cid, has in lifetime if not has]
        print(f"  scanned {scanned} customers: {len(lifetime)} hold {OLD_ENTITLEMENT!r} for life, "
              f"{len(lifetime) - len(todo)} already have founding, {len(todo)} to grant")
        if not self.rc.apply:
            if todo:
                print(f"    [plan] POST .../customers/<id>/actions/grant_entitlement x{len(todo)}  founding until 2100-01-01")
            return
        if not founding or dry(founding["id"]):
            raise Blocked("founding entitlement missing; run the entitlements step with --apply first")
        for cid in todo:
            self.rc.write("POST", f"{self.p}/customers/{urllib.parse.quote(cid, safe='')}/actions/grant_entitlement",
                          {"entitlement_id": founding["id"], "expires_at": PROMO_EXPIRES_MS}, "grant founding")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true", help="write changes (default is a dry run)")
    p.add_argument("--project-id", help="RevenueCat project id (proj...). Defaults to the only project the key sees.")
    p.add_argument("--only", help=f"comma list of steps: {','.join(STEPS)}")
    args = p.parse_args()
    steps = args.only.split(",") if args.only else STEPS
    if set(steps) - set(STEPS):
        p.error(f"unknown steps: {set(steps) - set(STEPS)}")
    print(f"revenuecat_replace: {'APPLY' if args.apply else 'DRY RUN (no writes)'}  steps {','.join(steps)}")
    try:
        rc = RC(args.apply)
        project = args.project_id
        if not project:
            projects = rc.get_all("/projects")
            print("  projects: " + ", ".join(f"{x['name']!r} ({x['id']})" for x in projects))
            if len(projects) != 1:
                raise Blocked("the key sees several projects; pass --project-id")
            project = projects[0]["id"]
        run = Run(rc, project)
        for step in steps:
            print(f"\n== {step}")
            getattr(run, "products_step" if step == "products" else step)()
    except Blocked as e:
        print(f"\nBLOCKED: {e}")
        sys.exit(2)
    print("\nManual: rename the project to 'Catchline'; turn on Customer Center; leave Paywalls unconfigured; "
          "put the public SDK keys in EAS secrets (EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY).")
    if not args.apply:
        print("Dry run only. Re-run with --apply to make these changes.")


if __name__ == "__main__":
    main()
