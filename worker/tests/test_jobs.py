import json
import logging
import os
import re
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
from catchline_cv import ANALYSIS_VERSION, pipeline
from catchline_cv import trace as cv_trace
from catchline_cv.video import ClipUnreadable

from catchline_worker import jobs
from catchline_worker.jobs import (
    DRAIN_RESERVE_S,
    ERROR_CODES,
    FUNCTION_TIMEOUT_S,
    MAX_ATTEMPTS,
    VISIBILITY_S,
    Job,
    Result,
    drain,
    error_code,
    process_one,
)

ROW = {
    "msg_id": 7,
    "lift_id": "lift-1",
    "user_id": "user-1",
    "movement": "snatch",
    "load_kg": 70.0,
    "clip_path": "user-1/lift-1",
    "attempt": 1,
}


class FakeDb:
    def __init__(self, jobs=(), fail_on=None, token="ExponentPushToken[x]", pose=None):
        self.jobs = list(jobs)
        self.calls = []
        self.fail_on = fail_on
        self.token = token
        self.pose = pose  # the phone's pose object: dict, raw bytes, or None for a server-pose lift

    def _maybe_fail(self, name):
        if self.fail_on == name:
            raise ConnectionError(f"{name} down")

    def rpc(self, fn, args):
        self.calls.append(("rpc", fn, args))
        self._maybe_fail(fn)
        if fn == "claim_lift_job":
            return [self.jobs.pop(0)] if self.jobs else []
        if fn == "complete_lift_job":
            return {"status": "done", "cue_id": "cue-1"}
        if fn == "fail_lift_job":
            return "queued" if args["p_retry"] else "failed"
        return None

    def pose_source(self, lift_id):
        self.calls.append(("pose_source", lift_id))
        return "server" if self.pose is None else "device"

    def download(self, bucket, path, dest):
        self.calls.append(("download", bucket, path))
        self._maybe_fail("download")
        body = b"clip"
        if path.endswith(".pose.json"):
            body = self.pose if isinstance(self.pose, bytes) else json.dumps(self.pose).encode()
        with open(dest, "wb") as fh:
            fh.write(body)

    def upload(self, bucket, path, src, content_type):
        self.calls.append(("upload", bucket, path, content_type))

    def remove(self, bucket, paths):
        self.calls.append(("remove", bucket, paths))
        self._maybe_fail("remove")

    def push_token(self, user_id):
        self.calls.append(("push_token", user_id))
        return self.token

    def names(self):
        return [c[1] if c[0] == "rpc" else c[0] for c in self.calls]


class FakePush:
    def __init__(self, fail=False):
        self.sent = []
        self.fail = fail

    def send(self, token, title, body, data):
        self.sent.append((token, title, body, data))
        if self.fail:
            raise ConnectionError("exp.host down")
        return {"data": {"status": "ok"}}


class TokenLookupDownDb(FakeDb):
    def push_token(self, user_id):
        raise ConnectionError("rest down")


FAILED_PUSH = ("ExponentPushToken[x]", "We couldn't analyse that clip", "Tap to film it again", {"liftId": "lift-1"})


class CvFailureDb(FakeDb):
    """complete_lift_job marks the lift failed when the analysis carries a `failure`."""

    def rpc(self, fn, args):
        if fn == "complete_lift_job":
            self.calls.append(("rpc", fn, args))
            return {"status": "failed", "cue_id": None}
        return super().rpc(fn, args)


def fake_analyse(clip, job, workdir):
    kf = os.path.join(workdir, "keyframes")
    os.makedirs(kf)
    paths = []
    for name in ("r1-1-setup.jpg", "r1-2-first_pull.jpg"):
        p = os.path.join(kf, name)
        open(p, "wb").close()
        paths.append(p)
    with open(clip, "rb") as fh:
        assert fh.read() == b"clip"
    return Result({"version": 1, "id": job.lift_id, "cue": {"faultId": "hips_rise_early"}}, paths)


def crashing_analyse(clip, job, workdir):
    raise RuntimeError("pose model exploded")


def test_empty_queue_returns_none():
    db = FakeDb()
    assert process_one(db, fake_analyse) is None
    assert db.calls == [("rpc", "claim_lift_job", {"p_vt": 960, "p_max_attempts": MAX_ATTEMPTS})]


def test_success_runs_download_analyse_upload_complete_then_deletes_clip():
    db = FakeDb([ROW])
    out = process_one(db, fake_analyse)
    assert out == {
        "lift_id": "lift-1",
        "status": "done",
        "cue_id": "cue-1",
        "keyframes": 2,
        "trace": False,
        "clip_deleted": True,
    }
    assert db.names() == [
        "claim_lift_job",
        "download",
        "pose_source",
        "upload",
        "upload",
        "complete_lift_job",
        "remove",
        "mark_clip_deleted",
    ]
    assert db.calls[1] == ("download", "raw-clips", "user-1/lift-1")
    assert db.calls[2] == ("pose_source", "lift-1")
    assert db.calls[3] == ("upload", "keyframes", "user-1/lift-1/r1-1-setup.jpg", "image/jpeg")
    assert db.calls[4] == ("upload", "keyframes", "user-1/lift-1/r1-2-first_pull.jpg", "image/jpeg")
    assert db.calls[5] == (
        "rpc",
        "complete_lift_job",
        {
            "p_msg_id": 7,
            "p_lift_id": "lift-1",
            "p_analysis": {"version": 1, "id": "lift-1", "cue": {"faultId": "hips_rise_early"}},
        },
    )
    assert db.calls[6] == ("remove", "raw-clips", ["user-1/lift-1", "user-1/lift-1.pose.json"])
    assert db.calls[7] == ("rpc", "mark_clip_deleted", {"p_lift_id": "lift-1"})


META = {"width": 608, "height": 1080, "fps": 30.0, "frameCount": 153, "rotation": 0}


class TraceDb(FakeDb):
    """Keeps what was uploaded to lift-traces; fails that upload when asked."""

    def __init__(self, *a, fail_trace=False, **kw):
        super().__init__(*a, **kw)
        self.fail_trace = fail_trace
        self.traces = {}

    def upload(self, bucket, path, src, content_type):
        super().upload(bucket, path, src, content_type)
        if bucket == "lift-traces":
            if self.fail_trace:
                raise ConnectionError("storage down")
            with open(src, "rb") as fh:
                self.traces[path] = fh.read()


@pytest.fixture
def reading_analyse(monkeypatch):
    """An analyse that reads the clip through the pipeline, as the real one does (the probe stands in)."""
    monkeypatch.setattr(pipeline, "probe", lambda clip: dict(META))

    def run(clip, job, workdir, pose=None):
        pipeline.probe(clip)
        r = fake_analyse(clip, job, workdir)
        return Result(r.analysis | {"pxPerCm": 4.5}, r.keyframes)

    return run


def test_the_trace_is_saved_gzipped_under_the_lift_before_completing(reading_analyse):
    db = TraceDb([ROW])
    out = process_one(db, reading_analyse)
    assert out["trace"] is True
    assert db.names() == [
        "claim_lift_job",
        "download",
        "pose_source",
        "upload",
        "upload",
        "upload",
        "complete_lift_job",
        "remove",
        "mark_clip_deleted",
    ]
    assert db.calls[5] == ("upload", "lift-traces", "user-1/lift-1.json.gz", "application/gzip")
    saved = cv_trace.loads(db.traces["user-1/lift-1.json.gz"])
    assert (saved["meta"], saved["scale"], saved["poseSource"]) == (META, 4.5, "server")
    assert saved["analysisVersion"] == ANALYSIS_VERSION
    assert pipeline.probe("x") == META, "the recording is undone after the job"


def test_no_trace_when_the_pipeline_never_read_the_clip():
    db = TraceDb([ROW])
    assert process_one(db, fake_analyse)["trace"] is False
    assert db.traces == {}


def test_a_trace_upload_failure_never_fails_the_lift(reading_analyse, caplog):
    db = TraceDb([ROW], fail_trace=True)
    with caplog.at_level(logging.ERROR):
        out = process_one(db, reading_analyse)
    assert (out["status"], out["trace"], out["clip_deleted"]) == ("done", False, True)
    assert "trace upload failed for lift lift-1" in caplog.text


POSE = {"source": "apple-vision", "fps": 30, "width": 1080, "height": 1920, "frames": []}


def test_device_pose_is_downloaded_and_handed_to_analyse():
    seen = {}

    def analyse_with_pose(clip, job, workdir, pose=None):
        seen["pose"] = pose
        return fake_analyse(clip, job, workdir)

    db = FakeDb([ROW], pose=POSE)
    out = process_one(db, analyse_with_pose)
    assert out["status"] == "done"
    assert seen["pose"] == POSE
    assert db.calls[1:4] == [
        ("download", "raw-clips", "user-1/lift-1"),
        ("pose_source", "lift-1"),
        ("download", "raw-clips", "user-1/lift-1.pose.json"),
    ]
    assert ("remove", "raw-clips", ["user-1/lift-1", "user-1/lift-1.pose.json"]) in db.calls


def test_server_pose_lift_never_downloads_a_pose():
    db = FakeDb([ROW])
    assert process_one(db, fake_analyse)["status"] == "done"
    assert [c for c in db.calls if c[0] == "download"] == [("download", "raw-clips", "user-1/lift-1")]


def test_unreadable_device_pose_falls_back_to_server_pose(caplog):
    db = FakeDb([ROW], pose=b"{not json")
    with caplog.at_level(logging.ERROR, logger="catchline_worker"):
        out = process_one(db, fake_analyse)
    assert out["status"] == "done"
    assert "device pose for lift lift-1 unusable; running server pose" in caplog.text


# #79: JSON that parses but is not a pose used to reach the pipeline and fail the lift 'unknown' three times.
@pytest.mark.parametrize("bad", [
    {"frames": "garbage"},
    [],
    {"fps": 30, "width": 1080, "height": 1920, "frames": [{"t": 0}]},
    dict(POSE, frames=[{"t": 0, "people": [{"box": [1, 2, 3], "kp": []}]}]),
])
def test_a_parseable_but_malformed_device_pose_falls_back_to_server_pose(bad, caplog):
    seen = {}

    def analyse_with_pose(clip, job, workdir, pose=None):
        seen["pose"] = pose
        return fake_analyse(clip, job, workdir)

    db = FakeDb([ROW], pose=bad)
    with caplog.at_level(logging.ERROR, logger="catchline_worker"):
        out = process_one(db, analyse_with_pose)
    assert out["status"] == "done"
    assert seen["pose"] is None
    assert "device pose for lift lift-1 unusable; running server pose" in caplog.text


def test_error_with_attempts_left_requeues_and_keeps_the_clip():
    db = FakeDb([ROW])
    out = process_one(db, crashing_analyse)
    assert out == {
        "lift_id": "lift-1",
        "status": "queued",
        "error": "unknown",
        "attempt": 1,
        "clip_deleted": False,
    }
    assert db.calls[-1] == (
        "rpc",
        "fail_lift_job",
        {"p_msg_id": 7, "p_lift_id": "lift-1", "p_error": "unknown", "p_retry": True},
    )
    assert "remove" not in db.names()


def test_error_on_last_attempt_fails_for_good_and_deletes_the_clip():
    db = FakeDb([ROW | {"attempt": MAX_ATTEMPTS}])
    out = process_one(db, crashing_analyse)
    assert out["status"] == "failed"
    assert out["clip_deleted"] is True
    assert db.names()[-3:] == ["fail_lift_job", "remove", "mark_clip_deleted"]
    assert db.calls[-3][2]["p_retry"] is False


def test_download_error_is_retried_like_any_other():
    db = FakeDb([ROW], fail_on="download")
    out = process_one(db, fake_analyse)
    assert out["status"] == "queued"
    assert out["error"] == "unknown"


def test_storage_delete_failure_is_logged_not_raised_and_reported():
    db = FakeDb([ROW], fail_on="remove")
    out = process_one(db, fake_analyse)
    assert out["status"] == "done"
    assert out["clip_deleted"] is False
    assert "mark_clip_deleted" not in db.names()


def test_drain_processes_until_the_queue_is_empty():
    db = FakeDb([ROW, ROW | {"msg_id": 8, "lift_id": "lift-2", "clip_path": "user-1/lift-2"}])
    out = drain(db, fake_analyse)
    assert [r["lift_id"] for r in out] == ["lift-1", "lift-2"]
    assert db.names().count("claim_lift_job") == 3


def test_job_keyframe_prefix_is_user_then_lift():
    assert Job(**ROW).keyframe_prefix == "user-1/lift-1"


def test_drain_respects_the_limit():
    db = FakeDb([ROW] * 5)
    assert len(drain(db, fake_analyse, limit=2)) == 2
    assert len(db.jobs) == 3


@pytest.mark.parametrize("attempt,retry", [(1, True), (2, True), (3, False)])
def test_retry_decision_by_attempt(attempt, retry):
    db = FakeDb([ROW | {"attempt": attempt}])
    process_one(db, crashing_analyse)
    fail = next(c for c in db.calls if c[0] == "rpc" and c[1] == "fail_lift_job")
    assert fail[2]["p_retry"] is retry


def test_success_notifies_the_owner_after_the_clip_is_deleted():
    db = FakeDb([ROW])
    push = FakePush()
    out = process_one(db, fake_analyse, push=push)
    assert out["status"] == "done"
    assert push.sent == [("ExponentPushToken[x]", "Your snatch is ready", "Tap to see your cue", {"liftId": "lift-1"})]
    assert db.names()[-3:] == ["remove", "mark_clip_deleted", "push_token"]
    assert db.calls[-1] == ("push_token", "user-1")


def test_no_token_means_no_push():
    db = FakeDb([ROW], token=None)
    push = FakePush()
    process_one(db, fake_analyse, push=push)
    assert push.sent == []


def test_no_push_client_means_no_token_lookup():
    db = FakeDb([ROW])
    process_one(db, fake_analyse)
    assert "push_token" not in db.names()


def test_cv_failure_notifies_that_the_clip_could_not_be_analysed():
    db = CvFailureDb([ROW])
    push = FakePush()
    out = process_one(db, fake_analyse, push=push)
    assert out["status"] == "failed"
    assert push.sent == [FAILED_PUSH]


def test_final_failure_notifies_but_a_retry_does_not():
    retry = FakePush()
    process_one(FakeDb([ROW]), crashing_analyse, push=retry)
    assert retry.sent == []

    final = FakePush()
    db = FakeDb([ROW | {"attempt": MAX_ATTEMPTS}])
    process_one(db, crashing_analyse, push=final)
    assert final.sent == [FAILED_PUSH]
    assert db.names()[-4:] == ["fail_lift_job", "remove", "mark_clip_deleted", "push_token"]


def test_push_errors_never_change_the_job_result():
    db = FakeDb([ROW])
    out = process_one(db, fake_analyse, push=FakePush(fail=True))
    assert out == {
        "lift_id": "lift-1",
        "status": "done",
        "cue_id": "cue-1",
        "keyframes": 2,
        "trace": False,
        "clip_deleted": True,
    }


def test_token_lookup_errors_never_change_the_job_result():
    db = TokenLookupDownDb([ROW])
    push = FakePush()
    out = process_one(db, fake_analyse, push=push)
    assert out["status"] == "done"
    assert push.sent == []


def test_drain_passes_the_push_client_through():
    db = FakeDb([ROW])
    push = FakePush()
    drain(db, fake_analyse, push=push)
    assert len(push.sent) == 1


def unreadable_analyse(clip, job, workdir):
    raise ClipUnreadable("no video stream in /Users/yash/catchline-worker/tmp/tmpabc/clip")


def zero_division_analyse(clip, job, workdir):
    return 1 / 0


def fail_error(db):
    return next(c for c in db.calls if c[0] == "rpc" and c[1] == "fail_lift_job")[2]["p_error"]


def test_unreadable_clip_stores_the_clip_unreadable_code_only():
    db = FakeDb([ROW | {"attempt": MAX_ATTEMPTS}])
    out = process_one(db, unreadable_analyse)
    assert fail_error(db) == "clip_unreadable"
    assert out["error"] == "clip_unreadable"


def test_unhandled_exception_stores_unknown_not_the_python_error():
    db = FakeDb([ROW])
    out = process_one(db, zero_division_analyse)
    assert fail_error(db) == "unknown"
    assert out["error"] == "unknown"


def test_full_traceback_goes_to_the_worker_log_not_the_db(caplog):
    db = FakeDb([ROW])
    with caplog.at_level(logging.ERROR, logger="catchline_worker"):
        process_one(db, zero_division_analyse)
    assert "ZeroDivisionError: division by zero" in caplog.text
    assert "Traceback (most recent call last)" in caplog.text
    assert "ZeroDivisionError" not in fail_error(db)


@pytest.mark.parametrize(
    "exc,code",
    [
        (ClipUnreadable("x"), "clip_unreadable"),
        (ZeroDivisionError("division by zero"), "unknown"),
        (subprocess.CalledProcessError(1, ["ffprobe", "/Users/yash/catchline-worker/tmp/x/clip"]), "unknown"),
        (ConnectionError("download down"), "unknown"),
    ],
)
def test_error_code_is_a_closed_set(exc, code):
    assert error_code(exc) == code
    assert code in ERROR_CODES


def test_error_codes_are_the_client_safe_set():
    assert {"clip_unreadable", "unknown"} == ERROR_CODES


def test_final_unreadable_clip_sends_the_failed_push_and_stores_only_the_code():
    push = FakePush()
    db = FakeDb([ROW | {"attempt": MAX_ATTEMPTS}])
    out = process_one(db, unreadable_analyse, push=push)
    assert out["status"] == "failed"
    assert fail_error(db) == "clip_unreadable"
    assert push.sent == [FAILED_PUSH]
    assert db.names()[-4:] == ["fail_lift_job", "remove", "mark_clip_deleted", "push_token"]


def test_unreadable_clip_on_the_first_attempt_fails_for_good_without_retries():
    push = FakePush()
    db = FakeDb([ROW])
    out = process_one(db, unreadable_analyse, push=push)
    assert out == {
        "lift_id": "lift-1",
        "status": "failed",
        "error": "clip_unreadable",
        "attempt": 1,
        "clip_deleted": True,
    }
    assert db.calls[-4] == (
        "rpc",
        "fail_lift_job",
        {"p_msg_id": 7, "p_lift_id": "lift-1", "p_error": "clip_unreadable", "p_retry": False},
    )
    assert push.sent == [FAILED_PUSH]


MODAL_APP = (Path(__file__).parent.parent / "modal_app.py").read_text()


def test_a_claim_outlives_the_modal_call_that_holds_it():
    timeout = int(re.findall(r"timeout=(\d+)", MODAL_APP.split("def drain(")[0])[-1])
    assert timeout == FUNCTION_TIMEOUT_S == 900
    assert timeout + 60 <= VISIBILITY_S


def test_modal_drain_runs_on_ten_eight_cpu_containers():
    assert "cpu=8.0, memory=8192, timeout=900, scaledown_window=180, max_containers=10)" in MODAL_APP
    assert "budget_s=FUNCTION_TIMEOUT_S - DRAIN_RESERVE_S" in MODAL_APP


class Clock:
    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now


def test_drain_stops_claiming_once_the_budget_is_spent(monkeypatch):
    clock = Clock()
    monkeypatch.setattr(jobs, "time", SimpleNamespace(monotonic=clock.monotonic))

    def slow_analyse(clip, job, workdir):
        clock.now += 250
        return fake_analyse(clip, job, workdir)

    db = FakeDb([ROW] * 5)
    out = drain(db, slow_analyse, budget_s=FUNCTION_TIMEOUT_S - DRAIN_RESERVE_S)
    assert len(out) == 3
    assert db.names().count("claim_lift_job") == 3
    assert len(db.jobs) == 2


def test_drain_without_a_budget_empties_the_queue(monkeypatch):
    clock = Clock()
    monkeypatch.setattr(jobs, "time", SimpleNamespace(monotonic=clock.monotonic))

    def slow_analyse(clip, job, workdir):
        clock.now += 10_000
        return fake_analyse(clip, job, workdir)

    assert len(drain(FakeDb([ROW] * 3), slow_analyse)) == 3


def test_each_job_logs_its_stage_timings(monkeypatch, caplog):
    clock = Clock()
    monkeypatch.setattr(jobs, "time", SimpleNamespace(monotonic=clock.monotonic))

    class TimedDb(FakeDb):
        def download(self, *a):
            clock.now += 1.5
            super().download(*a)

        def upload(self, *a):
            clock.now += 0.5
            super().upload(*a)

    def timed_analyse(clip, job, workdir):
        jobs.cv_pose.pose_seconds += 4.0
        clock.now += 6.0
        return fake_analyse(clip, job, workdir)

    with caplog.at_level(logging.INFO, logger="catchline_worker"):
        process_one(TimedDb([ROW]), timed_analyse)
    assert "lift lift-1 done attempt=1 download=1.5s pose=4.0s analysis=2.0s upload=1.0s total=8.5s" in caplog.text
