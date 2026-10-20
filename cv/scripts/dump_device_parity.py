"""Parity fixtures for the on-device port (src/analysis/device/analyseTrace.ts).

Replays each lift trace through pipeline.run and writes, per (trace, movement), one gzip JSON of what Python made of
it: the movement check, the reps found, each rep's events, phases, values, scale and bar track, and the final Analysis
JSON. The TS side reads the same trace and must produce the same numbers (src/analysis/device/parity.test.ts).

  uv run python scripts/dump_device_parity.py <out_dir> [--all] [--map list.txt] [trace file or dir ...]

Each trace runs as its golden movement (tests/golden/<name>.json) or the movement --map gives it (lines of
"<anything>/<name> <movement>"). --all also runs the other movements of the family, natural and forced onto the golden
reps, to reach the clean, jerk and muscle-up rep code on clips of other movements. Never commit the output of a private
trace dir (other athletes)."""
import copy
import glob
import gzip
import json
import math
import os
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from catchline_cv import lifts, pipeline, trace  # noqa: E402
from catchline_cv import movement as mv  # noqa: E402

GOLDEN = os.path.join(os.path.dirname(HERE), "tests", "golden")
MOVEMENTS = {"barbell": ["snatch", "clean", "jerk"], "hanging": ["kipping_pull_up", "bar_muscle_up"]}


def plain(o):
    """JSON-safe copy: arrays to lists, NaN/inf to None, tuples to lists."""
    if isinstance(o, np.ndarray):
        return plain(o.tolist())
    if isinstance(o, np.generic):
        return plain(o.item())
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, (list, tuple)):
        return [plain(v) for v in o]
    if isinstance(o, dict):
        return {str(k): plain(v) for k, v in o.items()}
    return o


REP_KEYS = ["rep_no", "start", "end", "made", "phases", "keys", "events", "values", "px_per_cm", "off_side_deg",
            "off_side_estimates", "span_cm", "scale_method", "scale_ok", "depth_ratio", "catch_depth",
            "catch_depth_frame", "catch_kind", "catch_knee_min", "plate_tracked", "plate_lost_at", "plate_wrist_corr",
            "peak_h", "drop", "turnover_s", "standing_h", "bar_speed", "cut_off", "hands_overlap", "stab_inliers_min",
            "fwd", "severity", "outcome", "miss", "bar_lost", "outcome_value", "outcome_frame", "s0"]


def rep_summary(info):
    if not isinstance(info, dict):
        return info
    out = {k: plain(copy.deepcopy(info[k])) for k in REP_KEYS if k in info}
    out["detail"] = plain({f: {k: v for k, v in d.items() if k in ("frame", "from_frame", "to_frame")}
                           for f, d in info["detail"].items()})
    ref = info["_ref"]
    for k in ("bar", "plate_ref", "knee_ang", "hip_ang", "elbow"):
        out[k] = plain(ref[k])
    out["path"] = plain(info["path"])
    out["plates"] = [plain(dict(p)) for p in info.get("plates", [])]
    return out


def capture(tr, movement, force=None):
    """Replay tr as movement; returns the expected dict, or None when the trace cannot answer it. force: the reps (or
    gymnastics cycles) to analyse in place of the ones the rep finder returns."""
    expected = {"repCalls": []}
    with trace.replaying(tr) as rp:
        finders = {(pipeline, "find_reps"): pipeline.find_reps, (lifts, "find_rack_reps"): lifts.find_rack_reps,
                   (lifts, "find_jerk_reps"): lifts.find_jerk_reps, (lifts.gym, "merge_cycles"): lifts.gym.merge_cycles}
        rep_fns = {(pipeline, "analyse_rep"): pipeline.analyse_rep, (lifts, "jerk_rep"): lifts.jerk_rep,
                   (lifts, "hang_rep"): lifts.hang_rep, (lifts, "hspu_rep"): lifts.hspu_rep}

        def finder(fn):
            def inner(*a, **kw):
                out = fn(*a, **kw)
                expected["findReps"] = plain(out)
                return [tuple(r) for r in force] if force is not None else out
            return inner

        def wrap_rep(fn, name):
            def inner(*a, **kw):
                out = fn(*a, **kw)
                expected["repCalls"].append({"fn": name, "result": rep_summary(out)})
                return out
            return inner

        for (m, n), fn in rep_fns.items():
            setattr(m, n, wrap_rep(fn, n))
        for (m, n), fn in finders.items():
            setattr(m, n, finder(fn))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                d = os.path.join(tmp, "debug")
                os.makedirs(d)
                res = pipeline.run("trace", os.path.join(tmp, "a.json"), os.path.join(tmp, "kf"), "kf", d,
                                   os.path.join(tmp, "cache"), "golden", movement)
        except trace.TraceMissing:
            return None
        finally:
            for (m, n), fn in list(rep_fns.items()) + list(finders.items()):
                setattr(m, n, fn)
        expected["misses"] = list(rp.misses)
        k, _, _ = rp.funcs()["select_lifter"](rp.funcs()["load_pose"](None, None)[0], hanging=mv.FAMILY.get(movement) == "hanging")
        world = pipeline.to_world(k, rp.funcs()["camera_path"](None, rp.funcs()["load_pose"](None, None)[0], None))

    analysis = res if isinstance(res, dict) else res[0]
    expected["analysis"] = json.loads(json.dumps(analysis))
    expected["signals"] = plain(mv.signals(world, tr["meta"]["fps"]))
    expected["detected"] = plain(pipeline.detect.detect(world, tr["meta"]["fps"], lifts=True))
    expected["world"] = plain(world)
    return expected


def trace_files(paths):
    out = []
    for p in paths:
        if os.path.isdir(p):
            out += sorted(glob.glob(os.path.join(p, "*.trace.json.gz"))) or sorted(glob.glob(os.path.join(p, "*.json.gz")))
        else:
            out.append(p)
    return out


def trace_name(p):
    b = os.path.basename(p)
    return b[: -len(".trace.json.gz")] if b.endswith(".trace.json.gz") else b[: -len(".json.gz")]


def main(argv):
    out_dir, rest = argv[0], argv[1:]
    sweep = "--all" in rest
    rest = [a for a in rest if a != "--all"]
    mapping = {}
    if "--map" in rest:
        i = rest.index("--map")
        for line in open(rest[i + 1]):
            if line.strip():
                ref, m = line.split()
                mapping[ref.split("/")[-1]] = m
        rest = rest[:i] + rest[i + 2:]
    os.makedirs(out_dir, exist_ok=True)
    for p in trace_files(rest or [os.path.join(os.path.dirname(HERE), "tests", "fixtures", "traces")]):
        name = trace_name(p)
        tr = trace.loads(open(p, "rb").read())
        gp = os.path.join(GOLDEN, name + ".json")
        golden = json.load(open(gp))["movement"] if os.path.exists(gp) else mapping.get(name)
        if not golden:
            print(f"{name}: no golden or mapped movement, skipped")
            continue
        fam = mv.FAMILY.get(golden, "barbell")
        movements = [golden] + ([m for m in MOVEMENTS.get(fam, []) if m != golden] if sweep else [])
        runs = [(m, None) for m in movements]
        while runs:
            m, force = runs.pop(0)
            expected = capture(tr, m, force)
            if expected is None:
                print(f"{name} {m}: trace cannot answer, skipped")
                continue
            if sweep and m == golden and expected.get("findReps"):
                runs += [(x, expected["findReps"]) for x in movements if x != golden and x != "kipping_pull_up"]
            tag = m + (".forced" if force is not None else "")
            doc = {"name": name, "movement": m, "golden": m == golden, "forced": force, "expected": expected}
            out = os.path.join(out_dir, f"{name}.{tag}.expected.json.gz")
            with open(out, "wb") as fh:
                fh.write(gzip.compress(json.dumps(doc, separators=(",", ":"), allow_nan=False).encode(), mtime=0))
            a = expected["analysis"]
            print(f"{name} {tag}: reps={len(a['reps'])} cue={(a.get('cue') or {}).get('faultId')} "
                  f"noCue={(a.get('noCueReason') or {}).get('code')} failure={(a.get('failure') or {}).get('code')} "
                  f"misses={len(expected['misses'])}")


if __name__ == "__main__":
    main(sys.argv[1:])
