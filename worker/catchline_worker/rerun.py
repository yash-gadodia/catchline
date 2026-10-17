"""Re-analyse finished lifts from their stored traces with the current cv code, no video needed.

    python -m catchline_worker rerun --since 2026-10-01 [--user <id>] [--dry-run]

Per lift: load the trace (lift-traces/<folder>/<lift>.json.gz, the folder being the keyframe folder the analysis
names), replay everything after pose through the same analyse() a new lift goes through, and save the result with
save_reanalysis (the old analysis is kept in analysis_history, the new one is current, cues move only when the
headline changed). An identical result is left alone, and so is one that now fails (a done lift keeps its analysis)."""
import argparse
import json
import logging
import tempfile
from collections import Counter

from catchline_cv import trace as cv_trace

from .jobs import TRACE_BUCKET, Job

log = logging.getLogger("catchline_worker")

PAGE = 500
VOLATILE = ("analysisRevision", "reanalysedAt")


def done_lifts(db, since: str, user: str | None = None):
    params = {"select": "id,user_id,movement,load_kg,clip_path", "status": "eq.done", "created_at": f"gte.{since}",
              "order": "created_at,id", "limit": PAGE}
    if user:
        params["user_id"] = f"eq.{user}"
    offset = 0
    while True:
        rows = db.select("lifts", params | {"offset": offset})
        yield from rows
        if len(rows) < PAGE:
            return
        offset += PAGE


def same(a: dict, b: dict) -> bool:
    def strip(x):
        return {k: v for k, v in json.loads(json.dumps(x)).items() if k not in VOLATILE}

    return strip(a) == strip(b)


def keep_stills(new: dict, old: dict) -> int:
    """A re-run makes no JPEGs, so every keyframe must name a still the lift already has. One the old analysis made
    keeps its image and frame; a new one (a moved phase, a new rep) takes the nearest old still. Returns how many
    were moved to another still."""
    stills = [kf for rep in old.get("reps", []) for kf in rep.get("keyFrames", [])]
    by_image = {kf["image"]: kf["frame"] for kf in stills}
    moved = 0
    for rep in new.get("reps", []):
        for kf in rep.get("keyFrames", []):
            if kf["image"] in by_image:
                kf["frame"] = by_image[kf["image"]]
            elif stills:
                near = min(stills, key=lambda s: abs(s["frame"] - kf["frame"]))
                kf["image"], kf["frame"] = near["image"], near["frame"]
                moved += 1
    return moved


def rerun_one(db, lift: dict, analyse, dry_run: bool = False) -> dict:
    out = {"lift_id": lift["id"]}
    rows = db.select("analyses", {"lift_id": f"eq.{lift['id']}", "select": "analysis"})
    if not rows:
        return out | {"outcome": "no_analysis"}
    old = rows[0]["analysis"]
    prefix = old.get("video", {}).get("uri") or f"{lift['user_id']}/{lift['id']}"
    data = db.get_bytes(TRACE_BUCKET, f"{prefix}.json.gz")
    if data is None:
        return out | {"outcome": "no_trace"}
    job = Job(0, lift["id"], prefix.split("/")[0], lift["movement"], lift["load_kg"], lift["clip_path"], 0)
    with tempfile.TemporaryDirectory() as tmp, cv_trace.replaying(cv_trace.loads(data)) as rp:
        new = analyse("trace", job, tmp).analysis
    out["misses"] = len(rp.misses)
    out["stills_moved"] = keep_stills(new, old)
    if new.get("failure"):
        return out | {"outcome": "now_fails"}
    if same(new, old):
        return out | {"outcome": "unchanged"}
    out["headline_changed"] = (old.get("cue") or {}).get("faultId") != (new.get("cue") or {}).get("faultId")
    if dry_run:
        return out | {"outcome": "would_save"}
    saved = db.rpc("save_reanalysis", {"p_lift_id": lift["id"], "p_analysis": new})
    return out | {"outcome": saved["status"], "headline_changed": bool(saved.get("headline_changed"))}


def rerun(db, analyse, since: str, user: str | None = None, dry_run: bool = False) -> dict:
    counts = Counter()
    for lift in done_lifts(db, since, user):
        try:
            r = rerun_one(db, lift, analyse, dry_run)
        except Exception:
            log.exception("re-run failed for lift %s", lift["id"])
            r = {"lift_id": lift["id"], "outcome": "error"}
        log.info("rerun %s", json.dumps(r))
        counts["lifts"] += 1
        counts[r["outcome"]] += 1
        counts["headline_changed"] += int(bool(r.get("headline_changed")) and r["outcome"] in ("saved", "would_save"))
        counts["approximate"] += int(r.get("misses", 0) > 0)
    return {"since": since, "user": user, "dry_run": dry_run} | dict(counts)


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser(prog="catchline_worker rerun", description="Re-analyse done lifts from their traces")
    ap.add_argument("--since", required=True, help="lifts created on or after this date (YYYY-MM-DD)")
    ap.add_argument("--user", default=None, help="only this user's lifts")
    ap.add_argument("--dry-run", action="store_true", help="count what would change, write nothing")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    from .__main__ import client
    from .analyse import analyse

    print(json.dumps(rerun(client(), analyse, a.since, a.user, a.dry_run)), flush=True)
