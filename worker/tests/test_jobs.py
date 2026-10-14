import logging
import os
import subprocess

import pytest
from catchline_cv.video import ClipUnreadable

from catchline_worker.jobs import ERROR_CODES, MAX_ATTEMPTS, Job, Result, drain, error_code, process_one

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
    def __init__(self, jobs=(), fail_on=None, token="ExponentPushToken[x]"):
        self.jobs = list(jobs)
        self.calls = []
        self.fail_on = fail_on
        self.token = token

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

    def download(self, bucket, path, dest):
        self.calls.append(("download", bucket, path))
        self._maybe_fail("download")
        with open(dest, "wb") as fh:
            fh.write(b"clip")

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
    assert db.calls == [("rpc", "claim_lift_job", {"p_vt": 600, "p_max_attempts": MAX_ATTEMPTS})]


def test_success_runs_download_analyse_upload_complete_then_deletes_clip():
    db = FakeDb([ROW])
    out = process_one(db, fake_analyse)
    assert out == {"lift_id": "lift-1", "status": "done", "cue_id": "cue-1", "keyframes": 2, "clip_deleted": True}
    assert db.names() == [
        "claim_lift_job",
        "download",
        "upload",
        "upload",
        "complete_lift_job",
        "remove",
        "mark_clip_deleted",
    ]
    assert db.calls[1] == ("download", "raw-clips", "user-1/lift-1")
    assert db.calls[2] == ("upload", "keyframes", "user-1/lift-1/r1-1-setup.jpg", "image/jpeg")
    assert db.calls[3] == ("upload", "keyframes", "user-1/lift-1/r1-2-first_pull.jpg", "image/jpeg")
    assert db.calls[4] == (
        "rpc",
        "complete_lift_job",
        {
            "p_msg_id": 7,
            "p_lift_id": "lift-1",
            "p_analysis": {"version": 1, "id": "lift-1", "cue": {"faultId": "hips_rise_early"}},
        },
    )
    assert db.calls[5] == ("remove", "raw-clips", ["user-1/lift-1"])
    assert db.calls[6] == ("rpc", "mark_clip_deleted", {"p_lift_id": "lift-1"})


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
    assert out == {"lift_id": "lift-1", "status": "done", "cue_id": "cue-1", "keyframes": 2, "clip_deleted": True}


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
