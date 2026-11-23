#!/usr/bin/env python3
"""Copy a version's App Store "What's New" text into the in-app What's new screen.

The store notes are written once per release in every language; this makes them the app's
changelog too, so the two never drift. Run it after the notes are saved in App Store Connect:

  scripts/store/whats-new.py 4.0.8 [--date 2026-11-23]

Writes one item per sentence (when every language has the same sentence count, else one item)
into src/i18n/<locale>/you.ts and a new top entry in src/features/whatsnew/changelog.ts.
"""
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from asc import request  # noqa: E402

APP_ID = "6785406082"
ROOT = Path(__file__).resolve().parents[2]
CHANGELOG = ROOT / "src/features/whatsnew/changelog.ts"
# App Store locale -> app catalogue
LOCALES = {"en-GB": "en", "es-ES": "es", "pt-BR": "pt-BR", "fr-FR": "fr", "de-DE": "de", "it": "it", "ja": "ja", "ko": "ko", "zh-Hans": "zh-Hans"}
ANCHOR = "  'you.whatsNew.version':"


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|(?<=[。！？])\s*", text.strip())
    return [p.strip() for p in parts if p.strip()]


def notes(version: str) -> dict[str, str]:
    status, body = request("GET", f"/v1/apps/{APP_ID}/appStoreVersions?filter[versionString]={version}&filter[platform]=IOS")
    if status != 200 or not body.get("data"):
        sys.exit(f"no App Store version {version} (HTTP {status})")
    vid = body["data"][0]["id"]
    status, body = request("GET", f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50")
    got = {x["attributes"]["locale"]: (x["attributes"].get("whatsNew") or "").strip() for x in body["data"]}
    missing = [loc for loc in LOCALES if not got.get(loc)]
    if missing:
        sys.exit(f"{version}: no What's New text for {', '.join(missing)}")
    return {app: got[store] for store, app in LOCALES.items()}


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    version = args[0]
    date = args[args.index("--date") + 1] if "--date" in args else None
    log = CHANGELOG.read_text()
    if f"version: '{version}'" in log:
        sys.exit(f"{version} is already in the changelog")

    text = notes(version)
    split = {loc: sentences(t) for loc, t in text.items()}
    counts = {len(s) for s in split.values()}
    items = split if len(counts) == 1 else {loc: [t] for loc, t in text.items()}
    tag = "v" + version.replace(".", "")
    keys = [f"you.whatsNew.{tag}.{i + 1}" for i in range(len(items["en"]))]

    for loc, lines in items.items():
        path = ROOT / f"src/i18n/{loc}/you.ts"
        src = path.read_text()
        at = src.index(ANCHOR)
        at = src.index("\n", at) + 1
        new = "".join(f"  '{k}': {json.dumps(s, ensure_ascii=False)},\n" for k, s in zip(keys, lines))
        path.write_text(src[:at] + new + src[at:])

    head = "export const CHANGELOG: ChangelogEntry[] = [\n"
    date_part = f"\n    date: '{date}'," if date else ""
    entry = f"  {{\n    version: '{version}',{date_part}\n    items: [{', '.join(repr(k) for k in keys)}],\n  }},\n"
    CHANGELOG.write_text(log.replace(head, head + entry, 1))
    print(f"{version}: {len(keys)} item(s) in {len(items)} languages")


if __name__ == "__main__":
    main()
