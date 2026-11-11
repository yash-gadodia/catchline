#!/usr/bin/env python3
"""Attach a processed build to an App Store version and submit it for review.

Dry run by default: prints the version, the build and what it would do. --apply attaches and submits.
The version must already exist with its listing (asc_replace.py); release stays manual.

  scripts/catchline-store/asc_submit.py --version 4.0.0 --build 40            # status only
  scripts/catchline-store/asc_submit.py --version 4.0.0 --build 40 --apply
"""
import argparse, sys
from asc_replace import ASC, APP_ID, errors


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--version", required=True); p.add_argument("--build", required=True)
    p.add_argument("--apply", action="store_true")
    a = p.parse_args()
    asc = ASC(a.apply)
    vs = asc.get(f"/v1/apps/{APP_ID}/appStoreVersions?filter[platform]=IOS&filter[versionString]={a.version}")["data"]
    if not vs:
        sys.exit(f"no version {a.version}")
    v = vs[0]
    print("version", a.version, v["id"], v["attributes"]["appStoreState"], "release:", v["attributes"]["releaseType"])
    bs = asc.get(f"/v1/builds?filter[app]={APP_ID}&filter[version]={a.build}&filter[preReleaseVersion.version]={a.version}")["data"]
    if not bs:
        sys.exit(f"build {a.build} is not in App Store Connect yet (still uploading or processing)")
    b = bs[0]
    print("build", a.build, b["id"], b["attributes"]["processingState"], "encryption:", b["attributes"].get("usesNonExemptEncryption"))
    if b["attributes"]["processingState"] != "VALID":
        sys.exit("build is not processed yet")
    if not a.apply:
        print("dry run: would attach the build and submit for review")
        return

    def must(method, path, body):
        status, doc = asc.call(method, path, body)
        if status >= 400:
            sys.exit(f"{method} {path} -> {status}: {errors(doc)}")
        return doc

    if b["attributes"].get("usesNonExemptEncryption") is None:
        must("PATCH", f"/v1/builds/{b['id']}", {"data": {"type": "builds", "id": b["id"], "attributes": {"usesNonExemptEncryption": False}}})
    must("PATCH", f"/v1/appStoreVersions/{v['id']}/relationships/build", {"data": {"type": "builds", "id": b["id"]}})
    print("attached")
    open_subs = asc.get(f"/v1/reviewSubmissions?filter[app]={APP_ID}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW")["data"]
    sub = open_subs[0] if open_subs else must("POST", "/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions", "attributes": {"platform": "IOS"},
        "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}})["data"]
    status, doc = asc.call("POST", "/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems", "relationships": {
        "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub["id"]}},
        "appStoreVersion": {"data": {"type": "appStoreVersions", "id": v["id"]}}}}})
    if status >= 400:
        sys.exit(f"could not add the version to the submission -> {status}: {errors(doc)}")
    must("PATCH", f"/v1/reviewSubmissions/{sub['id']}", {"data": {"type": "reviewSubmissions", "id": sub["id"], "attributes": {"submitted": True}}})
    print("submitted for review:", sub["id"])


if __name__ == "__main__":
    main()
