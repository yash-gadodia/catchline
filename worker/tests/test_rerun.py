import copy
import os
import tempfile

import pytest
from catchline_cv import rules
from catchline_cv import trace as cv_trace

from catchline_worker import rerun as mod
from catchline_worker.analyse import analyse
from catchline_worker.jobs import Job

TRACE = os.path.join(os.path.dirname(__file__), "..", "..", "cv", "tests", "fixtures", "traces",
                     "2026-10-05_21B27BAF.mov.trace.json.gz")
LIFT = {"id": "lift-1", "user_id": "user-2", "movement": "snatch", "load_kg": 70.0, "clip_path": "user-1/lift-1"}


@pytest.fixture(scope="module")
def blob():
    with open(TRACE, "rb") as fh:
        return fh.read()


@pytest.fixture(scope="module")
def stored(blob):
    """The analysis the worker saved for this lift: the same analyse() over the trace, from an older revision.
    The lift moved from user-1 to user-2 since, so its stills and trace sit in user-1's folder."""
    job = Job(0, "lift-1", "user-1", "snatch", 70.0, "user-1/lift-1", 0)
    with tempfile.TemporaryDirectory() as tmp, cv_trace.replaying(cv_trace.loads(blob)):
        a = analyse("trace", job, tmp).analysis
    return a | {"analysisRevision": "older-rev"}


class FakeDb:
    def __init__(self, lifts, analyses, traces):
        self.lifts, self.analyses, self.traces = lifts, analyses, traces
        self.calls = []

    def select(self, table, params):
        self.calls.append(("select", table, params))
        if table == "lifts":
            rows = [r for r in self.lifts if "user_id" not in params or params["user_id"] == f"eq.{r['user_id']}"]
            return rows[params["offset"]: params["offset"] + params["limit"]]
        lift = params["lift_id"].removeprefix("eq.")
        return [{"analysis": self.analyses[lift]}] if lift in self.analyses else []

    def get_bytes(self, bucket, path):
        self.calls.append(("get_bytes", bucket, path))
        return self.traces.get(path)

    def rpc(self, fn, args):
        self.calls.append(("rpc", fn, args))
        fault = lambda a: (a.get("cue") or {}).get("faultId")  # noqa: E731
        changed = fault(self.analyses[args["p_lift_id"]]) != fault(args["p_analysis"])
        return {"status": "saved", "headline_changed": changed, "cue_id": "cue-9"}

    def saves(self):
        return [c[2] for c in self.calls if c[:2] == ("rpc", "save_reanalysis")]


def test_unchanged_cv_code_reproduces_the_stored_analysis_and_writes_nothing(blob, stored):
    db = FakeDb([LIFT], {"lift-1": copy.deepcopy(stored)}, {"user-1/lift-1.json.gz": blob})
    out = mod.rerun(db, analyse, "2026-10-01")
    assert out == {"since": "2026-10-01", "user": None, "dry_run": False, "lifts": 1, "unchanged": 1,
                   "headline_changed": 0, "approximate": 0}
    assert ("get_bytes", "lift-traces", "user-1/lift-1.json.gz") in db.calls
    assert db.saves() == []


def test_a_rules_change_saves_a_new_current_analysis_with_the_new_headline(blob, stored, monkeypatch):
    monkeypatch.setitem(rules.RULES["bar_forward_off_hips"], "threshold", 1.0)
    db = FakeDb([LIFT], {"lift-1": copy.deepcopy(stored)}, {"user-1/lift-1.json.gz": blob})
    out = mod.rerun(db, analyse, "2026-10-01")
    assert (out["lifts"], out["saved"], out["headline_changed"], out["approximate"]) == (1, 1, 1, 0)
    (args,) = db.saves()
    new = args["p_analysis"]
    assert args["p_lift_id"] == "lift-1"
    # the stored lift is a partial (the miss had no measured cause); the lowered threshold gives it a headline
    assert (stored["cue"], stored["noCueReason"], new["cue"]["faultId"]) == (None, {"code": "unclear_miss"},
                                                                             "bar_forward_off_hips")
    assert new["video"]["uri"] == "user-1/lift-1"
    assert new["analysisRevision"] != "older-rev"
    old_stills = [(k["image"], k["frame"]) for r in stored["reps"] for k in r["keyFrames"]]
    assert [(k["image"], k["frame"]) for r in new["reps"] for k in r["keyFrames"]] == old_stills


def test_a_dry_run_counts_what_would_change_and_writes_nothing(blob, stored, monkeypatch):
    monkeypatch.setitem(rules.RULES["bar_forward_off_hips"], "threshold", 1.0)
    db = FakeDb([LIFT], {"lift-1": copy.deepcopy(stored)}, {"user-1/lift-1.json.gz": blob})
    out = mod.rerun(db, analyse, "2026-10-01", dry_run=True)
    assert (out["would_save"], out["headline_changed"], out["dry_run"]) == (1, 1, True)
    assert db.saves() == []


def test_a_new_analysis_version_alone_is_saved_so_trends_compare_like_with_like(blob, stored):
    db = FakeDb([LIFT], {"lift-1": copy.deepcopy(stored) | {"analysisVersion": "cv-2026.09.01"}},
                {"user-1/lift-1.json.gz": blob})
    out = mod.rerun(db, analyse, "2026-10-01")
    assert (out["saved"], out["headline_changed"]) == (1, 0)


def test_lifts_without_a_trace_or_analysis_are_counted_and_skipped(blob, stored):
    lifts = [LIFT, LIFT | {"id": "lift-2", "clip_path": "user-2/lift-2"}, LIFT | {"id": "lift-3"}]
    analyses = {"lift-1": copy.deepcopy(stored), "lift-2": {"version": 1, "video": {"uri": "user-2/lift-2"}}}
    db = FakeDb(lifts, analyses, {"user-1/lift-1.json.gz": blob})
    out = mod.rerun(db, analyse, "2026-10-01")
    assert (out["lifts"], out["unchanged"], out["no_trace"], out["no_analysis"]) == (3, 1, 1, 1)


def test_only_done_lifts_since_the_date_and_the_user_are_asked_for_page_by_page(monkeypatch):
    monkeypatch.setattr(mod, "PAGE", 2)
    lifts = [LIFT | {"id": f"lift-{i}"} for i in range(5)]
    db = FakeDb(lifts, {}, {})
    out = mod.rerun(db, analyse, "2026-10-01", user="user-2")
    assert (out["lifts"], out["no_analysis"], out["user"]) == (5, 5, "user-2")
    pages = [c[2] for c in db.calls if c[:2] == ("select", "lifts")]
    assert [p["offset"] for p in pages] == [0, 2, 4]
    assert pages[0] == {"select": "id,user_id,movement,load_kg,clip_path", "status": "eq.done",
                        "created_at": "gte.2026-10-01", "order": "created_at,id", "limit": 2, "user_id": "eq.user-2",
                        "offset": 0}


def test_a_broken_trace_is_an_error_for_that_lift_only(blob, stored):
    lifts = [LIFT | {"id": "lift-0"}, LIFT]
    analyses = {"lift-0": {"version": 1, "video": {"uri": "user-1/lift-0"}}, "lift-1": copy.deepcopy(stored)}
    db = FakeDb(lifts, analyses, {"user-1/lift-0.json.gz": b"not gzip", "user-1/lift-1.json.gz": blob})
    out = mod.rerun(db, analyse, "2026-10-01")
    assert (out["error"], out["unchanged"]) == (1, 1)


def test_new_keyframes_take_the_nearest_still_the_lift_already_has():
    old = {"reps": [{"keyFrames": [{"phase": "setup", "frame": 10, "image": "u/l/r1-1-setup.jpg"},
                                   {"phase": "catch", "frame": 60, "image": "u/l/r1-5-catch.jpg"}]}]}
    new = {"reps": [{"keyFrames": [{"phase": "setup", "frame": 12, "image": "u/l/r1-1-setup.jpg"}]},
                    {"keyFrames": [{"phase": "setup", "frame": 55, "image": "u/l/r2-1-setup.jpg"}]}]}
    assert mod.keep_stills(new, old) == 1
    assert new["reps"][0]["keyFrames"][0] == {"phase": "setup", "frame": 10, "image": "u/l/r1-1-setup.jpg"}
    assert new["reps"][1]["keyFrames"][0] == {"phase": "setup", "frame": 60, "image": "u/l/r1-5-catch.jpg"}
