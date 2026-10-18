#!/usr/bin/env python3
"""Vet every coaching cue in docs/catchline/fault-catalog/*.json.

Usage: python3 cv/scripts/vet_cues.py [--quiet]

Rules per cue (stdlib only, exit 1 if any cue fails):
  - at most 8 words, no em dash
  - none of: "try to", "make sure", "focus on", "engage", "don't" (except "don't bump")
  - "should" and "just" are matched as whole words (\\bshould\\b, \\bjust\\b) so
    "shoulders" and "adjust" pass
  - no medical words: "injur", "diagnos", "pain", "rehab"
  - shape: {"text": str, "sources": [url, ...]} with at least one http(s) URL
External focus is a guideline, not checkable, so it is not checked.
"""
import collections
import json
import pathlib
import re
import sys
from urllib.parse import urlparse

CATALOG = pathlib.Path(__file__).resolve().parents[2] / "docs" / "catchline" / "fault-catalog"
FILES = ["snatch.json", "clean_jerk.json", "gymnastics.json"]

BANNED_SUBSTRINGS = ["try to", "make sure", "focus on", "engage", "injur", "diagnos", "pain", "rehab"]
BANNED_WORDS = [re.compile(r"\bshould\b", re.I), re.compile(r"\bjust\b", re.I)]
DONT = re.compile(r"\bdon[’']t\b(?! bump)", re.I)

ORG_ALIASES = {
    "catalystathletics-org.catalystathletics.com": "catalystathletics.com",
    "pm.catalystathletics.com": "catalystathletics.com",
    "performancemenu.com": "catalystathletics.com",
    "games.crossfit.com": "crossfit.com",
    "library.crossfit.com": "crossfit.com",
    "assets.crossfit.com": "crossfit.com",
    "store.torokhtiy.com": "torokhtiy.com",
    "wodprep.teachable.com": "wodprep.com",
    "crossfitinvictus.com": "invictusfitness.com",
    "ncbi.nlm.nih.gov": "pmc.ncbi.nlm.nih.gov",
}


def org(url):
    host = urlparse(url).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return ORG_ALIASES.get(host, host)


def faults():
    for name in FILES:
        data = json.loads((CATALOG / name).read_text())
        groups = data.items() if isinstance(data, dict) else [(name[:-5], data)]
        for movement, group in groups:
            if isinstance(group, list):
                for f in group:
                    if isinstance(f, dict) and "cues" in f:
                        yield movement, f


def problems(cue):
    if not isinstance(cue, dict) or not isinstance(cue.get("text"), str):
        return ["not a {text, sources} object"]
    text = cue["text"]
    low = text.lower()
    out = []
    if len(text.split()) > 8:
        out.append(f"{len(text.split())} words")
    if "—" in text:
        out.append("em dash")
    out += [f'contains "{s}"' for s in BANNED_SUBSTRINGS if s in low]
    out += [f'contains "{p.pattern[2:-2]}"' for p in BANNED_WORDS if p.search(text)]
    if DONT.search(text):
        out.append('contains "don\'t"')
    srcs = cue.get("sources")
    if not isinstance(srcs, list) or not srcs or not all(isinstance(u, str) and u.startswith("http") for u in srcs):
        out.append("missing or bad sources")
    return out


def main():
    quiet = "--quiet" in sys.argv
    per_mv = collections.Counter()
    multi = collections.Counter()
    multi_org = collections.Counter()
    evidence = collections.Counter()
    failing = []
    seen = collections.defaultdict(set)
    for mv, f in faults():
        for cue in f["cues"]:
            per_mv[mv] += 1
            text = cue.get("text") if isinstance(cue, dict) else cue
            key = (text or "").lower().strip(" .!")
            if key in seen[(mv, f["id"])]:
                failing.append((mv, f["id"], text, ["duplicate within fault"]))
            seen[(mv, f["id"])].add(key)
            p = problems(cue)
            if p:
                failing.append((mv, f["id"], text, p))
                continue
            srcs = cue["sources"]
            if len(srcs) >= 2:
                multi[mv] += 1
            if len({org(u) for u in srcs}) >= 2:
                multi_org[mv] += 1
            evidence[cue.get("evidence", "unset")] += 1
    total = sum(per_mv.values())
    print(f"total cues: {total}")
    print(f"{'movement':<20}{'cues':>6}{'2+ src':>8}{'2+ orgs':>9}{'1 org':>7}")
    for mv in sorted(per_mv):
        print(f"{mv:<20}{per_mv[mv]:>6}{multi[mv]:>8}{multi_org[mv]:>9}{per_mv[mv] - multi_org[mv]:>7}")
    passing = total - len(failing)
    print(f"passing: {passing}  failing: {len(failing)}")
    print(f"sources >= 2 URLs: {sum(multi.values())}  1 URL: {passing - sum(multi.values())}")
    print(f"well-sourced (2+ independent orgs): {sum(multi_org.values())}  flagged single-org: {passing - sum(multi_org.values())}")
    print("evidence: " + ", ".join(f"{k}={v}" for k, v in sorted(evidence.items())))
    for mv, fid, text, p in failing[: None if not quiet else 20]:
        print(f"FAIL {mv}/{fid}: {text!r}: {'; '.join(p)}")
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main())
