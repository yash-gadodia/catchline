"""Traces (catchline_cv.trace): a lift re-analysed from its stored numbers, no video.

The traces in fixtures/traces/ were recorded on reference clips of tests/golden/ (only the owner's clip and one whose
pose is already in fixtures/: this repo is public, and the other reference clips show other athletes). Point
CATCHLINE_TRACES at a private directory to replay the rest too (the Mini keeps all ten in ~/catchline-traces-fixtures).
Replaying a trace with the cv code unchanged must give the golden analysis exactly; a rules change must show up.

With the clips (CATCHLINE_CLIPS, as for test_golden.py; CATCHLINE_POSE_CACHE may hold their .pose.pkl files) each clip
is also recorded and replayed afresh. Re-record the traces with CATCHLINE_GOLDEN_UPDATE=1 whenever the goldens are
re-recorded."""
import glob
import json
import os
import shutil

import numpy as np
import pytest

from catchline_cv import pipeline, rules, trace
from catchline_cv.pose import HEAD

HERE = os.path.dirname(__file__)
GOLDEN = os.path.join(HERE, "golden")
TRACES = os.path.join(HERE, "fixtures", "traces")
CLIPS = os.environ.get("CATCHLINE_CLIPS")
names = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(GOLDEN, "*.json")))
TRACE_DIRS = [TRACES] + ([os.environ["CATCHLINE_TRACES"]] if os.environ.get("CATCHLINE_TRACES") else [])
traced = sorted({os.path.basename(p)[: -len(".trace.json.gz")] for d in TRACE_DIRS
                 for p in glob.glob(os.path.join(d, "*.trace.json.gz"))} & set(names))


def golden(name):
    return json.load(open(os.path.join(GOLDEN, name + ".json")))


def run(clip, out, movement):
    os.makedirs(out / "debug", exist_ok=True)
    res = pipeline.run(clip, str(out / "analysis.json"), str(out / "keyframes"), "kf", str(out / "debug"),
                       str(out / "cache"), "golden", movement)
    return json.loads(json.dumps(res if isinstance(res, dict) else res[0]))


def stored(name):
    paths = [os.path.join(d, name + ".trace.json.gz") for d in TRACE_DIRS]
    with open(next(p for p in paths if os.path.exists(p)), "rb") as fh:
        return trace.loads(fh.read())


def replay(tr, out, movement):
    with trace.replaying(tr) as rp:
        return run("no-video-here", out, movement), rp.misses


def test_the_committed_traces_cover_a_barbell_and_a_gymnastics_reference_clip():
    assert {"2026-10-05_21B27BAF.mov", "2026-10-05_21B27BAF.mp4", "2026-09-22_A1F2F738.mov",
            "2026-09-22_A1F2F738.mp4"} <= set(traced)


@pytest.mark.parametrize("name", traced)
def test_a_stored_trace_replays_to_the_golden_analysis_exactly(name, tmp_path):
    g = golden(name)
    analysis, misses = replay(stored(name), tmp_path, g["movement"])
    assert misses == []
    assert analysis == g["analysis"]
    assert glob.glob(str(tmp_path / "keyframes" / "*.jpg")) == [], "a replay makes no stills"


def test_a_rules_change_is_picked_up_by_the_replay(tmp_path, monkeypatch):
    name = "2026-10-05_21B27BAF.mov"
    assert golden(name)["analysis"]["cue"]["faultId"] == "missed_forward"
    monkeypatch.setitem(rules.RULES["bar_forward_off_hips"], "threshold", 1.0)
    analysis, misses = replay(stored(name), tmp_path, "snatch")
    assert misses == []
    assert analysis["cue"]["faultId"] == "bar_forward_off_hips"
    assert {m["id"]: m["status"] for m in analysis["measurements"]}["bar_forward_off_hips"] == "cue"


def test_a_trace_holds_no_head_points_and_no_pixels():
    for name in traced:
        tr = stored(name)
        for outs in tr["calls"]["select_lifter"].values():
            for o in outs:
                k, ks, _ = trace.dec(o)
                assert np.isnan(k[:, list(HEAD)]).all() and (ks[:, list(HEAD)] == 0).all()
        blob = json.dumps(tr)
        assert '"uint8"' not in blob
        assert tr["meta"]["fps"] > 0 and tr["analysisVersion"] and tr["traceVersion"] == trace.TRACE_VERSION


def test_a_moved_window_is_answered_from_the_recorded_one_and_counted():
    tr = stored("2026-10-05_21B27BAF.mov")
    (k, outs), = tr["calls"]["stabilise"].items()
    a = int(k.split(":")[0])
    Ms = trace.dec(outs[0])[0]
    rp = trace.Replayer(tr)
    got, _ = rp.funcs()["stabilise"]([trace.Placeholder(i, (1280, 720, 3)) for i in range(a + 5, a + 15)], None)
    want = trace.rebase(Ms[5:15])
    assert np.allclose(got, want, atol=1e-9)
    assert np.allclose(got[0], [[1, 0, 0], [0, 1, 0]], atol=1e-9)
    assert rp.misses == [f"stabilise {a + 5}+10"]


def test_an_unknown_trace_version_is_refused():
    with pytest.raises(trace.TraceMissing):
        trace.Replayer({"traceVersion": 99})


@pytest.mark.skipif(not CLIPS, reason="CATCHLINE_CLIPS not set")
@pytest.mark.parametrize("name", names)
def test_recording_a_reference_clip_replays_to_the_same_analysis(name, tmp_path):
    clip = os.path.join(CLIPS, name)
    if not os.path.exists(clip):
        pytest.skip(f"{clip} not present")
    g = golden(name)
    cached = os.path.join(os.environ.get("CATCHLINE_POSE_CACHE", ""), name + ".pose.pkl")
    if os.environ.get("CATCHLINE_POSE_CACHE") and os.path.exists(cached):
        os.makedirs(tmp_path / "rec" / "cache")
        shutil.copy(cached, tmp_path / "rec" / "cache")
    with trace.recording() as rec:
        recorded = run(clip, tmp_path / "rec", g["movement"])
    assert recorded == g["analysis"]
    data = trace.dumps(rec.trace(recorded))
    if os.environ.get("CATCHLINE_GOLDEN_UPDATE"):
        os.makedirs(TRACES, exist_ok=True)
        with open(os.path.join(TRACES, name + ".trace.json.gz"), "wb") as fh:
            fh.write(data)
    analysis, misses = replay(trace.loads(data), tmp_path / "rep", g["movement"])
    assert misses == []
    assert analysis == recorded
