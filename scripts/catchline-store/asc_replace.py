#!/usr/bin/env python3
"""Replace Parallax with Catchline on the existing App Store Connect record (app 6785406082).

Dry run by default: reads everything, prints the plan, writes nothing. Pass --apply to write.
Every step is idempotent: it reads the current state first and only creates or patches what differs.
It never submits for review and never touches the old Parallax products (needed for grandfathering).

Stdlib only. The ES256 JWT is signed with the system `openssl` binary, using the key in .secrets/.

Usage:
  scripts/catchline-store/asc_replace.py                        # dry run, all steps
  scripts/catchline-store/asc_replace.py --apply \\
      --privacy-url https://yash-gadodia.github.io/catchline/legal/privacy.html --support-url https://yash-gadodia.github.io/catchline/support.html \\
      --marketing-url https://yash-gadodia.github.io/catchline/ --terms-url https://yash-gadodia.github.io/catchline/legal/terms.html \\
      --support-email pirsquare.yash+catchline@gmail.com --contact-first Yash --contact-last Gadodia --contact-phone +65... \\
      --demo-email <demo account>            # password from env CATCHLINE_DEMO_PASSWORD
  scripts/catchline-store/asc_replace.py --only preflight,iaps  # run a subset of steps
"""
import argparse, base64, hashlib, json, os, pathlib, re, subprocess, sys, time, urllib.error, urllib.request

REPO = pathlib.Path(__file__).resolve().parents[2]
KEY_PATH = REPO / ".secrets/appstore/AuthKey_7DMZ2M2W46.p8"
KID = "7DMZ2M2W46"
ISS = "80b00a67-32ac-4bc0-a791-2acad274762e"
APP_ID = "6785406082"
API = "https://api.appstoreconnect.apple.com"
LISTING = pathlib.Path.home() / "dev/liftcheck-research/launch/store-listing.md"
SCREENSHOTS = pathlib.Path.home() / "dev/liftcheck-research/launch/screenshots/ios-6.9"
VERSION = "3.0"
LOCALE = "en-GB"  # the app record's primary locale
GROUP_NAME = "Catchline"
EDITABLE = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"}
STEPS = ["preflight", "version", "appinfo", "localization", "review", "subscriptions", "iaps", "screenshots"]

SUBSCRIPTIONS = [
    # productId, reference name, period, level, USD, display name, description (<=55), trial
    ("catchline_platform_monthly", "Catchline Platform Monthly", "ONE_MONTH", 1, "14.99", "Platform", "100 videos a month, coach link, CSV export", False),
    ("catchline_platform_annual", "Catchline Platform Annual", "ONE_YEAR", 1, "99.99", "Platform (annual)", "100 videos a month, coach link, CSV export", False),
    ("catchline_pull_monthly", "Catchline Pull Monthly", "ONE_MONTH", 2, "9.99", "Pull", "40 videos a month, full cue memory, no watermark", False),
    ("catchline_pull_annual", "Catchline Pull Annual", "ONE_YEAR", 2, "59.99", "Pull (annual)", "40 videos a month, full cue memory, no watermark", False),
    ("catchline_pull_monthly_trial7", "Catchline Pull Monthly Trial", "ONE_MONTH", 2, "9.99", "Pull", "40 videos a month, full cue memory, no watermark", True),
    ("catchline_pull_annual_trial7", "Catchline Pull Annual Trial", "ONE_YEAR", 2, "59.99", "Pull (annual)", "40 videos a month, full cue memory, no watermark", True),
    ("catchline_hook_monthly", "Catchline Hook Monthly", "ONE_MONTH", 3, "4.99", "Hook", "12 videos a month and 90 days of cue memory", False),
    ("catchline_hook_annual", "Catchline Hook Annual", "ONE_YEAR", 3, "29.99", "Hook (annual)", "12 videos a month and 90 days of cue memory", False),
]
LIFETIME = ("catchline_founding_lifetime", "Catchline Founding Lifetime", "49.99", "Founding member",
            "Pull for life. One payment, 500 seats only")

WHATS_NEW = (
    "Parallax is now Catchline, a form check for weightlifting and CrossFit gymnastics. Film a side-on snatch, "
    "clean, jerk, kipping pull-up, bar muscle-up or kipping handstand push-up and get one cue to work on, with the "
    "measurement behind it. Your first 3 videos are free. If you bought Parallax lifetime, you get Catchline "
    "Founding membership (Pull for life) at no cost: tap Restore Purchases on the Plans screen. "
    "Questions: [SUPPORT_EMAIL]."
)
CHANGE_OF_PURPOSE = (
    "CHANGE OF PURPOSE (guideline 2.3.1)\n"
    "This record previously shipped as Parallax, a couples app. Version 3.0 replaces it entirely with Catchline, "
    "a lift form check, under the same developer, bundle id and record. Name, subtitle, description, keywords, "
    "screenshots, privacy labels and in-app purchases have all been updated to describe the new app; nothing from "
    "Parallax remains in the binary. Existing Parallax users were told in advance and their Parallax data has been "
    "deleted. Customers who bought the Parallax lifetime purchase receive the Catchline Founding membership at no "
    "cost via Restore Purchases. The old Parallax in-app purchases are no longer offered in the app.\n\n"
)
US_SPELLING = {"labelled": "labeled", "cancelled": "canceled", "analysed": "analyzed", "analyses": "analyzes",
               "analyse": "analyze", "colour": "color", "programme": "program", "catalogue": "catalog"}


class Blocked(Exception):
    pass


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def der_to_raw(der):
    if der[0] != 0x30:
        raise ValueError("unexpected signature encoding")
    i = 2 if der[1] < 0x80 else 2 + (der[1] & 0x7F)
    out = b""
    for _ in range(2):
        assert der[i] == 0x02
        n = der[i + 1]
        out += der[i + 2:i + 2 + n].lstrip(b"\x00").rjust(32, b"\x00")
        i += 2 + n
    return out


def mint_token():
    if not KEY_PATH.exists():
        raise Blocked(f"ASC key missing at {KEY_PATH.relative_to(REPO)}")
    now = int(time.time())
    header = b64url(json.dumps({"alg": "ES256", "kid": KID, "typ": "JWT"}).encode())
    payload = b64url(json.dumps({"iss": ISS, "iat": now, "exp": now + 1140, "aud": "appstoreconnect-v1"}).encode())
    signing_input = f"{header}.{payload}".encode()
    der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(KEY_PATH)], input=signing_input,
                         capture_output=True, check=True).stdout
    return f"{header}.{payload}.{b64url(der_to_raw(der))}"


class ASC:
    def __init__(self, apply):
        self.apply = apply
        self._token, self._minted = None, 0
        self.fake = 0

    def token(self):
        if time.time() - self._minted > 900:
            self._token, self._minted = mint_token(), time.time()
        return self._token

    def call(self, method, path, body=None):
        url = path if path.startswith("http") else API + path
        req = urllib.request.Request(url, method=method)
        req.add_header("Authorization", f"Bearer {self.token()}")
        data = None
        if body is not None:
            req.add_header("Content-Type", "application/json")
            data = json.dumps(body).encode()
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, data, timeout=60) as r:
                    raw = r.read()
                    return r.status, json.loads(raw) if raw else {}
            except urllib.error.HTTPError as e:
                raw = e.read()
                doc = json.loads(raw) if raw.strip().startswith(b"{") else {}
                if e.code == 429 and attempt < 3:
                    time.sleep(5 * (attempt + 1))
                    continue
                codes = [err.get("code", "") for err in doc.get("errors", [])]
                if e.code == 403 and any("REQUIRED_AGREEMENTS" in c for c in codes):
                    raise Blocked("App Store Connect returned 403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED. "
                                  "The Account Holder must accept the latest agreement in App Store Connect > "
                                  "Business (and keep the Paid Apps agreement Active), then re-run.")
                if e.code in (401, 403):
                    raise Blocked(f"App Store Connect returned {e.code} {codes or ''} on {method} {path}. "
                                  "Check the API key role (needs App Manager or Admin) and that it is not revoked.")
                return e.code, doc

    def get(self, path):
        status, doc = self.call("GET", path)
        if status == 404:
            return None
        if status >= 400:
            raise RuntimeError(f"GET {path} -> {status}: {errors(doc)}")
        return doc

    def get_all(self, path):
        items, url = [], path
        while url:
            doc = self.get(url)
            if doc is None:
                break
            data = doc.get("data", [])
            items += data if isinstance(data, list) else [data]
            url = doc.get("links", {}).get("next")
        return items

    def bulk(self, method, label, path, body):
        status, doc = self.call(method, path, body)
        if status >= 400 and not any(e.get("code", "").endswith("DUPLICATE") for e in doc.get("errors", [])):
            raise RuntimeError(f"{method} {path} ({label}) -> {status}: {errors(doc)}")

    def write(self, method, path, body, what):
        if not self.apply:
            print(f"    [plan] {method} {path}  {what}")
            self.fake += 1
            return {"data": {"id": f"DRYRUN-{self.fake}", "attributes": {}}}
        status, doc = self.call(method, path, body)
        if status >= 400:
            raise RuntimeError(f"{method} {path} -> {status}: {errors(doc)}")
        print(f"    [done] {method} {path}  {what}")
        return doc


def errors(doc):
    return "; ".join(f"{e.get('code')}: {e.get('detail')}" for e in doc.get("errors", [])) or json.dumps(doc)[:300]


def dry(id_):
    return str(id_).startswith("DRYRUN-")


def rel(type_, id_):
    return {"data": {"type": type_, "id": id_}}


# ---------- copy from store-listing.md ----------

def listing_copy(args):
    text = LISTING.read_text()
    row = lambda field: re.search(rf"^\| {re.escape(field)} \| [^|]+ \| `([^`]+)` \|", text, re.M).group(1)
    block = lambda heading: re.search(rf"^### {re.escape(heading)}[^\n]*\n+```\n(.*?)\n```", text, re.M | re.S).group(1)
    apple = text.split("## 2. Google Play")[0]
    text = apple

    def us(s):
        for gb, am in US_SPELLING.items():
            s = re.sub(rf"\b{gb}\b", am, s)
            s = re.sub(rf"\b{gb.capitalize()}\b", am.capitalize(), s)
        return s

    description = us(block("Description"))
    if args.terms_url:
        description = description.replace("https://yash-gadodia.github.io/catchline/legal/terms.html", args.terms_url)
    if args.privacy_url:
        description = description.replace("https://yash-gadodia.github.io/catchline/legal/privacy.html", args.privacy_url)
    notes = block("App Review notes")
    notes = re.sub(r"^Email: \[DEMO_EMAIL\]\nPassword: \[DEMO_PASSWORD\]\n",
                   "Credentials are in the Sign-in information fields.\n", notes, flags=re.M)
    notes = notes.replace("Hello App Review team,\n\n", "Hello App Review team,\n\n" + CHANGE_OF_PURPOSE)
    fill = {"[SUPPORT_EMAIL]": args.support_email, "[PHONE]": args.contact_phone}
    whats_new = args.whats_new or WHATS_NEW
    for k, v in fill.items():
        if v:
            notes, whats_new = notes.replace(k, v), whats_new.replace(k, v)
    return {
        "name": row("App name"), "subtitle": row("Subtitle"),
        "promotionalText": us(row("Promotional text")), "keywords": row("Keyword field"),
        "description": description, "whatsNew": whats_new, "notes": notes,
    }


LIMITS = {"name": 30, "subtitle": 30, "promotionalText": 170, "keywords": 100, "description": 4000,
          "whatsNew": 4000, "notes": 4000}


def check_copy(copy, apply, allow_placeholders):
    bad = []
    for k, limit in LIMITS.items():
        n = len(copy[k])
        flag = "" if n <= limit else "  OVER LIMIT"
        print(f"    {k:16} {n:5}/{limit}{flag}")
        if n > limit:
            bad.append(f"{k} is {n} chars (limit {limit})")
        left = sorted(set(re.findall(r"\[[A-Z_][^\]]*\]|\[confirm[^\]]*\]", copy[k])))
        if left:
            print(f"    {'':16} placeholders left: {', '.join(left)}")
            if apply and not allow_placeholders:
                bad.append(f"{k} still has placeholders {left}")
    if bad:
        raise Blocked("Copy not ready: " + "; ".join(bad) + ". Fix store-listing.md or pass the flags "
                      "(or --allow-placeholders to send them anyway).")


# ---------- steps ----------

class Run:
    def __init__(self, asc, args):
        self.asc, self.args = asc, args
        self.version_id = None
        self.version_loc_id = None
        self.manual = []

    # preflight
    def preflight(self):
        a = self.asc
        app = a.get(f"/v1/apps/{APP_ID}")["data"]["attributes"]
        print(f"  app: {app.get('name')!r}  bundle {app.get('bundleId')}  sku {app.get('sku')}  primary locale {app.get('primaryLocale')}")
        if app.get("bundleId") != "com.yashgadodia.parallax":
            raise Blocked(f"unexpected bundle id {app.get('bundleId')}; this script is for the Parallax record")
        print("  app infos:")
        for i in a.get_all(f"/v1/apps/{APP_ID}/appInfos"):
            at = i["attributes"]
            print(f"    {i['id']}  state={at.get('state') or at.get('appStoreState')}")
        print("  versions (iOS):")
        for v in a.get_all(f"/v1/apps/{APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20"):
            at = v["attributes"]
            print(f"    {at['versionString']:8} {at.get('appVersionState') or ''} / {at.get('appStoreState')}  ({v['id']})")
        print("  in-app purchases (left untouched unless they are Catchline's):")
        for p in a.get_all(f"/v1/apps/{APP_ID}/inAppPurchasesV2?limit=200"):
            at = p["attributes"]
            print(f"    {at['productId']:34} {at.get('inAppPurchaseType')}  {at.get('state')}")
        print("  subscription groups:")
        for g in a.get_all(f"/v1/apps/{APP_ID}/subscriptionGroups?limit=50"):
            print(f"    group {g['attributes']['referenceName']!r} ({g['id']})")
            for s in a.get_all(f"/v1/subscriptionGroups/{g['id']}/subscriptions?limit=50"):
                at = s["attributes"]
                print(f"      {at['productId']:34} {at.get('subscriptionPeriod')}  level {at.get('groupLevel')}  {at.get('state')}")

    # version 3.0
    def version(self):
        a = self.asc
        versions = a.get_all(f"/v1/apps/{APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20")
        editable = [v for v in versions if (v["attributes"].get("appVersionState") or v["attributes"].get("appStoreState")) in EDITABLE
                    or v["attributes"].get("appStoreState") in EDITABLE]
        if editable:
            v = editable[0]
            self.version_id = v["id"]
            if v["attributes"]["versionString"] == VERSION:
                print(f"  editable version {VERSION} already exists ({v['id']})")
            else:
                a.write("PATCH", f"/v1/appStoreVersions/{v['id']}",
                        {"data": {"type": "appStoreVersions", "id": v["id"], "attributes": {"versionString": VERSION}}},
                        f"rename editable version {v['attributes']['versionString']} -> {VERSION}")
        else:
            doc = a.write("POST", "/v1/appStoreVersions",
                          {"data": {"type": "appStoreVersions",
                                    "attributes": {"platform": "IOS", "versionString": VERSION, "releaseType": "MANUAL"},
                                    "relationships": {"app": rel("apps", APP_ID)}}},
                          f"create iOS version {VERSION} (manual release)")
            self.version_id = doc["data"]["id"]

    def ensure_version(self):
        if not self.version_id:
            for v in self.asc.get_all(f"/v1/apps/{APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20"):
                st = v["attributes"].get("appVersionState") or v["attributes"].get("appStoreState")
                if v["attributes"]["versionString"] == VERSION and (st in EDITABLE or v["attributes"].get("appStoreState") in EDITABLE):
                    self.version_id = v["id"]
        return self.version_id

    # app info: name, subtitle, privacy url
    def appinfo(self, copy):
        a = self.asc
        infos = a.get_all(f"/v1/apps/{APP_ID}/appInfos")
        editable = [i for i in infos if (i["attributes"].get("state") or i["attributes"].get("appStoreState")) in EDITABLE | {"PREPARE_FOR_SUBMISSION"}]
        want = {"name": copy["name"], "subtitle": copy["subtitle"]}
        if self.args.privacy_url:
            want["privacyPolicyUrl"] = self.args.privacy_url
        if not editable:
            print("  no editable app info yet (it appears once version 3.0 exists); planned values:")
            for k, v in want.items():
                print(f"    [plan] appInfoLocalization {LOCALE}.{k} = {v!r}")
            return
        info_id = editable[0]["id"]
        locs = a.get_all(f"/v1/appInfos/{info_id}/appInfoLocalizations")
        loc = next((l for l in locs if l["attributes"]["locale"] == LOCALE), None)
        others = [l["attributes"]["locale"] for l in locs if l["attributes"]["locale"] != LOCALE]
        if others:
            self.manual.append(f"Other app info locales still say Parallax: {', '.join(others)}. Update or delete them in ASC.")
        if loc is None:
            a.write("POST", "/v1/appInfoLocalizations",
                    {"data": {"type": "appInfoLocalizations", "attributes": {"locale": LOCALE, **want},
                              "relationships": {"appInfo": rel("appInfos", info_id)}}}, f"create {LOCALE} app info localization")
            return
        diff = {k: v for k, v in want.items() if loc["attributes"].get(k) != v}
        if not diff:
            print(f"  app info {LOCALE} already up to date")
            return
        for k, v in diff.items():
            print(f"    {k}: {loc['attributes'].get(k)!r} -> {v!r}")
        a.write("PATCH", f"/v1/appInfoLocalizations/{loc['id']}",
                {"data": {"type": "appInfoLocalizations", "id": loc["id"], "attributes": diff}}, "update name/subtitle/privacy URL")

    # version localization
    def localization(self, copy):
        a = self.asc
        want = {k: copy[k] for k in ("description", "keywords", "promotionalText", "whatsNew")}
        if self.args.support_url:
            want["supportUrl"] = self.args.support_url
        if self.args.marketing_url:
            want["marketingUrl"] = self.args.marketing_url
        vid = self.ensure_version()
        if not vid or dry(vid):
            print(f"  version {VERSION} not created yet; would set on its {LOCALE} localization: {', '.join(want)}")
            return
        locs = a.get_all(f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations")
        loc = next((l for l in locs if l["attributes"]["locale"] == LOCALE), None)
        others = [l["attributes"]["locale"] for l in locs if l["attributes"]["locale"] != LOCALE]
        if others:
            self.manual.append(f"Version {VERSION} has other locales still carrying Parallax copy: {', '.join(others)}.")
        if loc is None:
            doc = a.write("POST", "/v1/appStoreVersionLocalizations",
                          {"data": {"type": "appStoreVersionLocalizations", "attributes": {"locale": LOCALE, **want},
                                    "relationships": {"appStoreVersion": rel("appStoreVersions", vid)}}},
                          f"create {LOCALE} version localization")
            self.version_loc_id = doc["data"]["id"]
            return
        self.version_loc_id = loc["id"]
        diff = {k: v for k, v in want.items() if loc["attributes"].get(k) != v}
        if not diff:
            print(f"  version {LOCALE} localization already up to date")
            return
        a.write("PATCH", f"/v1/appStoreVersionLocalizations/{loc['id']}",
                {"data": {"type": "appStoreVersionLocalizations", "id": loc["id"], "attributes": diff}},
                f"update {', '.join(diff)}")

    # review details
    def review(self, copy):
        a, args = self.asc, self.args
        want = {"notes": copy["notes"]}
        for k, v in (("contactFirstName", args.contact_first), ("contactLastName", args.contact_last),
                     ("contactPhone", args.contact_phone), ("contactEmail", args.support_email),
                     ("demoAccountName", args.demo_email), ("demoAccountPassword", os.environ.get("CATCHLINE_DEMO_PASSWORD"))):
            if v:
                want[k] = v
        want["demoAccountRequired"] = bool(args.demo_email)

        if "demoAccountName" not in want:
            self.manual.append("Demo account: pass --demo-email and set CATCHLINE_DEMO_PASSWORD, or fill Sign-in information in ASC.")
        shown = ", ".join(k if k != "demoAccountPassword" else "demoAccountPassword (from env)" for k in want)
        vid = self.ensure_version()
        if not vid or dry(vid):
            print(f"  version {VERSION} not created yet; would set review details: {shown}")
            return
        doc = a.get(f"/v1/appStoreVersions/{vid}/appStoreReviewDetail")
        current = doc and doc.get("data")
        if not current:
            a.write("POST", "/v1/appStoreReviewDetails",
                    {"data": {"type": "appStoreReviewDetails", "attributes": want,
                              "relationships": {"appStoreVersion": rel("appStoreVersions", vid)}}}, f"create review details: {shown}")
            return
        diff = {k: v for k, v in want.items() if current["attributes"].get(k) != v}
        if not diff:
            print("  review details already up to date")
            return
        a.write("PATCH", f"/v1/appStoreReviewDetails/{current['id']}",
                {"data": {"type": "appStoreReviewDetails", "id": current["id"], "attributes": diff}},
                f"update review details: {', '.join(k if k != 'demoAccountPassword' else 'demoAccountPassword (from env)' for k in diff)}")

    # territories
    def territories(self):
        if not hasattr(self, "_territories"):
            self._territories = [t["id"] for t in self.asc.get_all("/v1/territories?limit=200")]
        return self._territories

    # subscriptions
    def subscriptions(self):
        a = self.asc
        groups = a.get_all(f"/v1/apps/{APP_ID}/subscriptionGroups?limit=50")
        group = next((g for g in groups if g["attributes"]["referenceName"] == GROUP_NAME), None)
        if group:
            gid = group["id"]
            print(f"  group {GROUP_NAME!r} exists ({gid})")
        else:
            gid = a.write("POST", "/v1/subscriptionGroups",
                          {"data": {"type": "subscriptionGroups", "attributes": {"referenceName": GROUP_NAME},
                                    "relationships": {"app": rel("apps", APP_ID)}}}, f"create subscription group {GROUP_NAME!r}")["data"]["id"]
        if dry(gid) or not any(l["attributes"]["locale"] == LOCALE for l in a.get_all(f"/v1/subscriptionGroups/{gid}/subscriptionGroupLocalizations")):
            a.write("POST", "/v1/subscriptionGroupLocalizations",
                    {"data": {"type": "subscriptionGroupLocalizations", "attributes": {"locale": LOCALE, "name": "Catchline"},
                              "relationships": {"subscriptionGroup": rel("subscriptionGroups", gid)}}}, "group localization 'Catchline'")
        existing = {} if dry(gid) else {s["attributes"]["productId"]: s for s in a.get_all(f"/v1/subscriptionGroups/{gid}/subscriptions?limit=50")}
        for pid, ref, period, level, usd, display, desc, trial in SUBSCRIPTIONS:
            print(f"  {pid}  {period} level {level}  ${usd}{'  +1 week free trial' if trial else ''}")
            if pid in existing:
                sid = existing[pid]["id"]
                at = existing[pid]["attributes"]
                if at.get("groupLevel") != level:
                    print(f"    note: group level is {at.get('groupLevel')}, PRODUCTS.md says {level}; reorder levels in ASC if needed")
            else:
                sid = a.write("POST", "/v1/subscriptions",
                              {"data": {"type": "subscriptions",
                                        "attributes": {"name": ref, "productId": pid, "subscriptionPeriod": period,
                                                       "groupLevel": level, "familySharable": False,
                                                       "reviewNote": "Unlocks the Catchline plan named in the display name. See App Review notes."},
                                        "relationships": {"group": rel("subscriptionGroups", gid)}}}, "create subscription")["data"]["id"]
            self.sub_details(sid, display, desc, usd, trial)

    def sub_details(self, sid, display, desc, usd, trial):
        a = self.asc
        new = dry(sid)
        if new or not any(l["attributes"]["locale"] == LOCALE for l in a.get_all(f"/v1/subscriptions/{sid}/subscriptionLocalizations")):
            a.write("POST", "/v1/subscriptionLocalizations",
                    {"data": {"type": "subscriptionLocalizations", "attributes": {"locale": LOCALE, "name": display, "description": desc},
                              "relationships": {"subscription": rel("subscriptions", sid)}}}, f"localization {display!r}")
        if new or not a.get(f"/v1/subscriptions/{sid}/subscriptionAvailability"):
            a.write("POST", "/v1/subscriptionAvailabilities",
                    {"data": {"type": "subscriptionAvailabilities", "attributes": {"availableInNewTerritories": True},
                              "relationships": {"subscription": rel("subscriptions", sid),
                                                "availableTerritories": {"data": [{"type": "territories", "id": t} for t in self.territories()]}}}},
                    f"availability: all {len(self.territories())} territories")
        priced = set() if new else {p["relationships"]["territory"]["data"]["id"]
                                    for p in a.get_all(f"/v1/subscriptions/{sid}/prices?include=territory&limit=200")
                                    if p.get("relationships", {}).get("territory", {}).get("data")}
        if new:
            print(f"    [plan] POST /v1/subscriptionPrices  USA ${usd} (price point looked up after create), then Apple's equalized price in every other territory")
        elif "USA" not in priced or self.args.equalize:
            points = a.get_all(f"/v1/subscriptions/{sid}/pricePoints?filter[territory]=USA&limit=200")
            point = next((p for p in points if p["attributes"]["customerPrice"] == usd), None)
            if not point:
                raise RuntimeError(f"no USA price point at ${usd} for subscription {sid}")
            todo = [] if "USA" in priced else [("USA", point["id"])]
            if self.args.equalize:
                eq = a.get_all(f"/v1/subscriptionPricePoints/{point['id']}/equalizations?include=territory&limit=200")
                todo += [(e["relationships"]["territory"]["data"]["id"], e["id"]) for e in eq
                         if e["relationships"]["territory"]["data"]["id"] not in priced]
            if not todo:
                print("    prices already set")
            elif not a.apply:
                print(f"    [plan] POST /v1/subscriptionPrices x{len(todo)}  USA ${usd} + equalized territories")
            else:
                for terr, pp in todo:
                    a.bulk("POST", terr, "/v1/subscriptionPrices",
                           {"data": {"type": "subscriptionPrices", "attributes": {"startDate": None, "preserveCurrentPrice": False},
                                     "relationships": {"subscription": rel("subscriptions", sid),
                                                       "subscriptionPricePoint": rel("subscriptionPricePoints", pp)}}})
                print(f"    [done] prices set in {len(todo)} territories")
        else:
            print("    USA price already set")
        if trial:
            has = False if new else bool(a.get_all(f"/v1/subscriptions/{sid}/introductoryOffers?limit=1"))
            if has:
                print("    free trial already set")
            elif not a.apply:
                print(f"    [plan] POST /v1/subscriptionIntroductoryOffers x{len(self.territories())}  FREE_TRIAL ONE_WEEK, every territory")
            else:
                for t in self.territories():
                    a.bulk("POST", t, "/v1/subscriptionIntroductoryOffers",
                           {"data": {"type": "subscriptionIntroductoryOffers",
                                     "attributes": {"duration": "ONE_WEEK", "offerMode": "FREE_TRIAL", "numberOfPeriods": 1},
                                     "relationships": {"subscription": rel("subscriptions", sid), "territory": rel("territories", t)}}})
                print("    [done] 1-week free trial in every territory")
        self.review_screenshot(sid, new, "/v1/subscriptions/{}/appStoreReviewScreenshot",
                               "/v1/subscriptionAppStoreReviewScreenshots", "subscriptionAppStoreReviewScreenshots",
                               {"subscription": rel("subscriptions", sid)})

    # non-consumable founding lifetime
    def iaps(self):
        a = self.asc
        pid, ref, usd, display, desc = LIFETIME
        existing = {p["attributes"]["productId"]: p for p in a.get_all(f"/v1/apps/{APP_ID}/inAppPurchasesV2?limit=200")}
        print(f"  {pid}  NON_CONSUMABLE ${usd}")
        if pid in existing:
            iid = existing[pid]["id"]
        else:
            iid = a.write("POST", "/v2/inAppPurchases",
                          {"data": {"type": "inAppPurchases",
                                    "attributes": {"name": ref, "productId": pid, "inAppPurchaseType": "NON_CONSUMABLE",
                                                   "familySharable": False,
                                                   "reviewNote": "Founding member: Pull features for the life of the app, limited to 500 purchases. See App Review notes."},
                                    "relationships": {"app": rel("apps", APP_ID)}}}, "create non-consumable")["data"]["id"]
        new = dry(iid)
        if new or not any(l["attributes"]["locale"] == LOCALE for l in a.get_all(f"/v2/inAppPurchases/{iid}/inAppPurchaseLocalizations")):
            a.write("POST", "/v1/inAppPurchaseLocalizations",
                    {"data": {"type": "inAppPurchaseLocalizations", "attributes": {"locale": LOCALE, "name": display, "description": desc},
                              "relationships": {"inAppPurchaseV2": rel("inAppPurchases", iid)}}}, f"localization {display!r}")
        if new or not a.get(f"/v2/inAppPurchases/{iid}/inAppPurchaseAvailability"):
            a.write("POST", "/v1/inAppPurchaseAvailabilities",
                    {"data": {"type": "inAppPurchaseAvailabilities", "attributes": {"availableInNewTerritories": True},
                              "relationships": {"inAppPurchase": rel("inAppPurchases", iid),
                                                "availableTerritories": {"data": [{"type": "territories", "id": t} for t in self.territories()]}}}},
                    f"availability: all {len(self.territories())} territories")
        sched = None if new else a.get(f"/v2/inAppPurchases/{iid}/iapPriceSchedule")
        if sched and sched.get("data"):
            print("    price schedule already set")
        elif new:
            print(f"    [plan] POST /v1/inAppPurchasePriceSchedules  base territory USA ${usd}; Apple equalizes the rest")
        else:
            points = a.get_all(f"/v2/inAppPurchases/{iid}/pricePoints?filter[territory]=USA&limit=200")
            point = next((p for p in points if p["attributes"]["customerPrice"] == usd), None)
            if not point:
                raise RuntimeError(f"no USA price point at ${usd} for {pid}")
            a.write("POST", "/v1/inAppPurchasePriceSchedules",
                    {"data": {"type": "inAppPurchasePriceSchedules",
                              "relationships": {"inAppPurchase": rel("inAppPurchases", iid),
                                                "baseTerritory": rel("territories", "USA"),
                                                "manualPrices": {"data": [{"type": "inAppPurchasePrices", "id": "${price-usa}"}]}}},
                     "included": [{"type": "inAppPurchasePrices", "id": "${price-usa}", "attributes": {"startDate": None},
                                   "relationships": {"inAppPurchasePricePoint": rel("inAppPurchasePricePoints", point["id"])}}]},
                    f"price schedule: base USA ${usd}, Apple equalizes the rest")
        self.review_screenshot(iid, new, "/v2/inAppPurchases/{}/appStoreReviewScreenshot",
                               "/v1/inAppPurchaseAppStoreReviewScreenshots", "inAppPurchaseAppStoreReviewScreenshots",
                               {"inAppPurchaseV2": rel("inAppPurchases", iid)})

    def review_screenshot(self, oid, new, get_path, post_path, type_, relationships):
        path = self.args.iap_review_screenshot
        if not path:
            if "iap-shot" not in self.manual:
                self.manual.append("iap-shot")
            return
        if not new:
            doc = self.asc.get(get_path.format(oid))
            if doc and doc.get("data"):
                print("    review screenshot already uploaded")
                return
        self.upload(post_path, type_, relationships, pathlib.Path(path), "review screenshot")

    # uploads (reserve -> PUT parts -> commit)
    def upload(self, post_path, type_, relationships, file, what):
        data = file.read_bytes()
        if not self.asc.apply:
            print(f"    [plan] upload {what} {file.name} ({len(data)} bytes) via {post_path}")
            return
        doc = self.asc.write("POST", post_path, {"data": {"type": type_, "attributes": {"fileName": file.name, "fileSize": len(data)},
                                                         "relationships": relationships}}, f"reserve {what} {file.name}")
        rid = doc["data"]["id"]
        for op in doc["data"]["attributes"]["uploadOperations"]:
            req = urllib.request.Request(op["url"], method=op["method"], data=data[op["offset"]:op["offset"] + op["length"]])
            for h in op.get("requestHeaders", []):
                req.add_header(h["name"], h["value"])
            urllib.request.urlopen(req, timeout=120).read()
        self.asc.write("PATCH", f"{post_path}/{rid}",
                       {"data": {"type": type_, "id": rid,
                                 "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}}},
                       f"commit {what} {file.name}")

    # 6.9" screenshots
    def screenshots(self):
        a = self.asc
        folder = pathlib.Path(self.args.screenshots).expanduser()
        files = sorted(folder.glob("*.png")) if folder.is_dir() else []
        if not files:
            print(f"  skipped: no PNGs in {folder}")
            self.manual.append(f"Upload 6.9\" screenshots (none found in {folder}; run render_screenshots.sh).")
            return
        for f in files:
            w, h = png_size(f)
            if (w, h) != (1320, 2868):
                raise Blocked(f"{f.name} is {w}x{h}; App Store 6.9\" needs 1320x2868")
        print(f"  {len(files)} PNGs at 1320x2868 in {folder}")
        vid = self.ensure_version()
        if not self.version_loc_id and vid and not dry(vid):
            locs = a.get_all(f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations")
            loc = next((l for l in locs if l["attributes"]["locale"] == LOCALE), None)
            self.version_loc_id = loc and loc["id"]
        lid = self.version_loc_id
        if not lid or dry(lid):
            print(f"    [plan] create APP_IPHONE_67 set on the {LOCALE} localization of {VERSION}, delete the copied Parallax screenshots, upload {len(files)}")
            return
        sets = a.get_all(f"/v1/appStoreVersionLocalizations/{lid}/appScreenshotSets")
        target = next((s for s in sets if s["attributes"]["screenshotDisplayType"] == "APP_IPHONE_67"), None)
        current = a.get_all(f"/v1/appScreenshotSets/{target['id']}/appScreenshots") if target else []
        if [s["attributes"]["fileName"] for s in current] == [f.name for f in files]:
            print("  6.9\" set already holds exactly these files")
            return
        for s in sets:
            shots = a.get_all(f"/v1/appScreenshotSets/{s['id']}/appScreenshots")
            for shot in shots:
                a.write("DELETE", f"/v1/appScreenshots/{shot['id']}", None,
                        f"delete old {s['attributes']['screenshotDisplayType']} screenshot {shot['attributes'].get('fileName')}")
        if not target:
            target = a.write("POST", "/v1/appScreenshotSets",
                             {"data": {"type": "appScreenshotSets", "attributes": {"screenshotDisplayType": "APP_IPHONE_67"},
                                       "relationships": {"appStoreVersionLocalization": rel("appStoreVersionLocalizations", lid)}}},
                             "create APP_IPHONE_67 set")["data"]
        for f in files:
            self.upload("/v1/appScreenshots", "appScreenshots", {"appScreenshotSet": rel("appScreenshotSets", target["id"])}, f, "screenshot")
        previews = a.get_all(f"/v1/appStoreVersionLocalizations/{lid}/appPreviewSets")
        if previews:
            self.manual.append("App preview videos from Parallax are still attached to 3.0: delete them in ASC.")


def png_size(path):
    head = path.read_bytes()[:24]
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


MANUAL = """
Remaining manual steps (this script never submits):
  1. Upload build 3.0 (eas build -p ios --profile production, then eas submit) and attach it to version 3.0.
  2. App Privacy labels: replace Parallax's answers with the Catchline set (store-listing.md: photos/videos,
     fitness, usage data; no tracking). Age rating 4+. Category Health & Fitness, secondary Sports.
  3. Subscription group: confirm level order Platform > Pull > Hook in ASC (drag to reorder if needed).
  4. Attach the subscriptions and the founding lifetime to version 3.0 ("In-App Purchases and Subscriptions"),
     first-time IAPs must ship with a version.
  5. Old Parallax products: leave them; consider "Remove from sale" once Catchline 3.0 is live
     (restores keep working). Do NOT delete parallax_plus_lifetime: it is the grandfathering key.
  6. Review everything in ASC, then press Add for Review / Submit yourself."""


def main():
    global VERSION
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true", help="write changes (default is a dry run)")
    p.add_argument("--only", help=f"comma list of steps: {','.join(STEPS)}")
    p.add_argument("--privacy-url"); p.add_argument("--terms-url")
    p.add_argument("--support-url"); p.add_argument("--marketing-url")
    p.add_argument("--support-email"); p.add_argument("--contact-first"); p.add_argument("--contact-last"); p.add_argument("--contact-phone")
    p.add_argument("--demo-email", help="demo account; password comes from env CATCHLINE_DEMO_PASSWORD")
    p.add_argument("--version", default=VERSION, help="App Store version string; must equal app.json \"version\" exactly")
    p.add_argument("--whats-new", help="override the 3.0 What's New text")
    p.add_argument("--screenshots", default=str(SCREENSHOTS), help="folder of 1320x2868 PNGs, uploaded in name order")
    p.add_argument("--iap-review-screenshot", help="PNG of the paywall, attached to every new subscription/IAP")
    p.add_argument("--no-equalize", dest="equalize", action="store_false",
                   help="subscriptions: set only the USA price (other territories then stay unpriced)")
    p.add_argument("--allow-placeholders", action="store_true", help="send copy even if [PLACEHOLDERS] remain")
    args = p.parse_args()
    VERSION = args.version
    steps = args.only.split(",") if args.only else STEPS
    unknown = set(steps) - set(STEPS)
    if unknown:
        p.error(f"unknown steps: {unknown}")

    print(f"asc_replace: {'APPLY' if args.apply else 'DRY RUN (no writes)'}  app {APP_ID}  steps {','.join(steps)}")
    run = Run(ASC(args.apply), args)
    try:
        copy = listing_copy(args)
        print("\n== copy check (store-listing.md, en-US spelling)")
        check_copy(copy, args.apply, args.allow_placeholders)
        for step in steps:
            print(f"\n== {step}")
            fn = getattr(run, step)
            fn(copy) if step in ("appinfo", "localization", "review") else fn()
    except Blocked as e:
        print(f"\nBLOCKED: {e}")
        sys.exit(2)
    if "iap-shot" in run.manual:
        run.manual.remove("iap-shot")
        run.manual.append("IAP review screenshots: pass --iap-review-screenshot <paywall.png> or attach one per product in ASC.")
    print(MANUAL)
    for i, m in enumerate(run.manual, 7):
        print(f"  {i}. {m}")
    if not args.apply:
        print("\nDry run only. Re-run with --apply to make these changes.")


if __name__ == "__main__":
    main()
