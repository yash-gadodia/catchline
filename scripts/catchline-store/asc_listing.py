#!/usr/bin/env python3
"""Put a new App Store version's listing in place: version, copy per locale, screenshots, app preview.

  python3 scripts/catchline-store/asc_listing.py --version 4.0.4 --copy <copy.json> --shots <dir> [--preview <mp4>] [--go]

copy.json: {"<locale>": {"name","subtitle","promotionalText","keywords","description","whatsNew"}, ...}
Screenshots (<dir>/01.png..) and the preview go on the primary locale only; other locales fall back to them.
It never submits for review. Without --go it prints what it would do.
"""
import argparse, hashlib, json, sys, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from asc_replace import ASC  # noqa: E402

APP = "6785406082"
PRIMARY = "en-GB"
SHOT_TYPE = "APP_IPHONE_67"      # the 6.9" set, takes 1320 x 2868
PREVIEW_TYPE = "IPHONE_67"


def ok(status, doc, what):
    if status >= 300:
        raise SystemExit(f"{what}: {status} {json.dumps(doc.get('errors', doc))[:600]}")
    return doc


class Listing:
    def __init__(self, go):
        self.c = ASC(go)
        self.go = go

    def req(self, method, path, body=None, what=""):
        if not self.go and method != "GET":
            print(f"  would {method} {path} {what}")
            return {"data": {"id": "dry", "attributes": {}}}
        s, d = self.c.call(method, path, body)
        return ok(s, d, f"{method} {path} {what}")

    def version(self, v):
        d = self.req("GET", f"/v1/apps/{APP}/appStoreVersions?filter[platform]=IOS&limit=10")
        for x in d["data"]:
            if x["attributes"]["versionString"] == v:
                print(f"version {v} exists ({x['attributes']['appStoreState']})")
                return x["id"]
        print(f"create version {v}")
        d = self.req("POST", "/v1/appStoreVersions", {"data": {"type": "appStoreVersions",
            "attributes": {"platform": "IOS", "versionString": v, "releaseType": "MANUAL"},
            "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})
        return d["data"]["id"]

    def editable_appinfo(self):
        d = self.req("GET", f"/v1/apps/{APP}/appInfos")
        live = {"READY_FOR_DISTRIBUTION", "READY_FOR_SALE"}
        for x in d["data"]:
            if (x["attributes"].get("state") or x["attributes"].get("appStoreState")) not in live:
                return x["id"]
        return d["data"][0]["id"]

    def copy(self, vid, copy):
        info = self.editable_appinfo()
        vlocs = {x["attributes"]["locale"]: x["id"] for x in self.req("GET", f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50")["data"]} if vid != "dry" else {}
        ilocs = {x["attributes"]["locale"]: x["id"] for x in self.req("GET", f"/v1/appInfos/{info}/appInfoLocalizations?limit=50")["data"]}
        for loc, c in copy.items():
            ia = {"name": c["name"], "subtitle": c["subtitle"]}
            if loc in ilocs:
                self.req("PATCH", f"/v1/appInfoLocalizations/{ilocs[loc]}", {"data": {"type": "appInfoLocalizations", "id": ilocs[loc], "attributes": ia}}, f"{loc} name/subtitle")
            else:
                self.req("POST", "/v1/appInfoLocalizations", {"data": {"type": "appInfoLocalizations", "attributes": {"locale": loc, **ia},
                    "relationships": {"appInfo": {"data": {"type": "appInfos", "id": info}}}}}, f"{loc} name/subtitle")
            va = {k: c[k] for k in ("description", "keywords", "promotionalText", "whatsNew")}
            if vid != "dry":   # adding an appInfo locale creates the version locale too
                vlocs = {x["attributes"]["locale"]: x["id"] for x in self.req("GET", f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50")["data"]}
            if loc in vlocs:
                self.req("PATCH", f"/v1/appStoreVersionLocalizations/{vlocs[loc]}", {"data": {"type": "appStoreVersionLocalizations", "id": vlocs[loc], "attributes": va}}, f"{loc} copy")
            else:
                self.req("POST", "/v1/appStoreVersionLocalizations", {"data": {"type": "appStoreVersionLocalizations",
                    "attributes": {"locale": loc, **va}, "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}}, f"{loc} copy")
            print(f"  {loc}: {c['name']} | {c['subtitle']}")
        return vlocs.get(PRIMARY)

    def upload(self, kind, parent_type, parent_id, path):
        data = path.read_bytes()
        attrs = {"fileName": path.name, "fileSize": len(data)}
        if kind == "appPreviews":
            attrs["mimeType"] = "video/mp4"
        rel = "appScreenshotSet" if kind == "appScreenshots" else "appPreviewSet"
        d = self.req("POST", f"/v1/{kind}", {"data": {"type": kind, "attributes": attrs,
            "relationships": {rel: {"data": {"type": parent_type, "id": parent_id}}}}}, path.name)
        if not self.go:
            return
        for op in d["data"]["attributes"]["uploadOperations"]:
            chunk = data[op["offset"]: op["offset"] + op["length"]]
            r = urllib.request.Request(op["url"], data=chunk, method=op["method"], headers={h["name"]: h["value"] for h in op["requestHeaders"]})
            urllib.request.urlopen(r, timeout=300).read()
        self.req("PATCH", f"/v1/{kind}/{d['data']['id']}", {"data": {"type": kind, "id": d["data"]["id"],
            "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}}}, f"commit {path.name}")
        print(f"  uploaded {path.name}")

    def set_for(self, loc_id, rel, typ, attr, value):
        d = self.req("GET", f"/v1/appStoreVersionLocalizations/{loc_id}/{rel}")
        for x in d["data"]:
            if x["attributes"][attr] == value:
                return x["id"]
        d = self.req("POST", f"/v1/{typ}", {"data": {"type": typ, "attributes": {attr: value},
            "relationships": {"appStoreVersionLocalization": {"data": {"type": "appStoreVersionLocalizations", "id": loc_id}}}}}, value)
        return d["data"]["id"]

    def shots(self, loc_id, folder):
        sid = self.set_for(loc_id, "appScreenshotSets", "appScreenshotSets", "screenshotDisplayType", SHOT_TYPE)
        if sid != "dry":
            for x in self.req("GET", f"/v1/appScreenshotSets/{sid}/appScreenshots")["data"]:
                self.req("DELETE", f"/v1/appScreenshots/{x['id']}", what="old screenshot")
        for p in sorted(Path(folder).glob("[0-9][0-9].png")):
            self.upload("appScreenshots", "appScreenshotSets", sid, p)

    def preview(self, loc_id, mp4):
        pid = self.set_for(loc_id, "appPreviewSets", "appPreviewSets", "previewType", PREVIEW_TYPE)
        if pid != "dry":
            for x in self.req("GET", f"/v1/appPreviewSets/{pid}/appPreviews")["data"]:
                self.req("DELETE", f"/v1/appPreviews/{x['id']}", what="old preview")
        self.upload("appPreviews", "appPreviewSets", pid, Path(mp4))


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--version", required=True)
    a.add_argument("--copy", required=True)
    a.add_argument("--shots")
    a.add_argument("--preview")
    a.add_argument("--go", action="store_true")
    args = a.parse_args()
    copy = json.loads(Path(args.copy).read_text())
    limits = {"name": 30, "subtitle": 30, "promotionalText": 170, "keywords": 100, "description": 4000, "whatsNew": 4000}
    for loc, c in copy.items():
        for k, n in limits.items():
            if len(c[k]) > n:
                raise SystemExit(f"{loc} {k} is {len(c[k])} > {n}")
    L = Listing(args.go)
    vid = L.version(args.version)
    primary = L.copy(vid, copy)
    if primary is None and vid != "dry":
        primary = L.copy(vid, {PRIMARY: copy[PRIMARY]})
    if args.shots and primary:
        L.shots(primary, args.shots)
    if args.preview and primary:
        L.preview(primary, args.preview)
    print("done" if args.go else "dry run: add --go")


if __name__ == "__main__":
    main()
