import logging
import os
import tempfile
import time
import traceback
from collections.abc import Callable
from dataclasses import dataclass

from catchline_cv import external_pose
from catchline_cv import pose as cv_pose
from catchline_cv import trace as cv_trace
from catchline_cv.video import ClipUnreadable

from .push import failed_message, ready_message

log = logging.getLogger("catchline_worker")

RAW_BUCKET = "raw-clips"
KEYFRAME_BUCKET = "keyframes"
TRACE_BUCKET = "lift-traces"
MAX_ATTEMPTS = 3
FUNCTION_TIMEOUT_S = 900  # modal_app.drain's timeout
# a claimed job stays invisible for longer than any call can run, so no second container claims it mid-run
VISIBILITY_S = FUNCTION_TIMEOUT_S + 60
# drain stops claiming once less than this is left of the call, so a backlog never kills a call mid-job
DRAIN_RESERVE_S = 300

# The only strings ever written to lifts.error (client-readable). Everything else stays in the worker log.
ERROR_CODES = {"clip_unreadable", "unknown"}
# codes a retry can never fix: fail on the first attempt
FINAL_CODES = {"clip_unreadable"}


def error_code(e: BaseException) -> str:
    return "clip_unreadable" if isinstance(e, ClipUnreadable) else "unknown"


@dataclass(frozen=True)
class Job:
    msg_id: int
    lift_id: str
    user_id: str
    movement: str
    load_kg: float | None
    clip_path: str
    attempt: int

    @property
    def keyframe_prefix(self) -> str:
        return f"{self.user_id}/{self.lift_id}"

    @property
    def pose_path(self) -> str:
        return f"{self.clip_path}.pose.json"

    @property
    def trace_path(self) -> str:
        return f"{self.keyframe_prefix}.json.gz"


@dataclass(frozen=True)
class Result:
    analysis: dict
    keyframes: list[str]


Analyse = Callable[[str, Job, str], Result]


def claim(db, max_attempts: int = MAX_ATTEMPTS) -> Job | None:
    rows = db.rpc("claim_lift_job", {"p_vt": VISIBILITY_S, "p_max_attempts": max_attempts})
    return Job(**rows[0]) if rows else None


def fetch_pose(db, job: Job, workdir: str) -> dict | None:
    """The phone's body pose for a lift enqueue_lift marked pose_source 'device', else None. A pose that will not
    download or parse is logged and the job falls back to running RTMPose here."""
    if db.pose_source(job.lift_id) != "device":
        return None
    path = os.path.join(workdir, "pose.json")
    try:
        db.download(RAW_BUCKET, job.pose_path, path)
        return external_pose.load(path)
    except Exception:
        log.exception("device pose for lift %s unusable; running server pose", job.lift_id)
        return None


def save_trace(db, job: Job, rec: cv_trace.Recorder, result: Result, pose: dict | None, workdir: str) -> bool:
    """Keep what the pipeline read from the clip (catchline_cv.trace: the lifter's keypoints without head points,
    camera path, plate track; no video) so the lift can be re-analysed after the clip is gone. Best effort: a lift
    without a trace is only one that cannot be re-run. Nothing is kept when the pipeline never read the clip."""
    if rec.meta is None:
        return False
    try:
        path = os.path.join(workdir, "trace.json.gz")
        with open(path, "wb") as fh:
            fh.write(cv_trace.dumps(rec.trace(result.analysis, "server" if pose is None else "device")))
        db.upload(TRACE_BUCKET, job.trace_path, path, "application/gzip")
        return True
    except Exception:
        log.exception("trace upload failed for lift %s", job.lift_id)
        return False


def delete_clip(db, job: Job) -> bool:
    """Delete the raw clip (and the phone's pose next to it, if any) and record it. If Storage is unreachable the
    clip stays for purge_storage (the pg_cron backstop) to remove within 24 h, so this logs instead of raising."""
    try:
        db.remove(RAW_BUCKET, [job.clip_path, job.pose_path])
        db.rpc("mark_clip_deleted", {"p_lift_id": job.lift_id})
        return True
    except Exception:
        log.exception("raw clip delete failed for lift %s; purge_storage will remove it", job.lift_id)
        return False


def notify(db, push, job: Job, ok: bool) -> None:
    """Tell the lifter the terminal state, if they asked to be told. Best effort: the
    lift is already saved, so a push problem is logged and never fails the job."""
    if push is None:
        return
    try:
        token = db.push_token(job.user_id)
        if not token:
            return
        title, body = ready_message(job.movement) if ok else failed_message()
        push.send(token, title, body, {"liftId": job.lift_id})
    except Exception:
        log.exception("push for lift %s failed", job.lift_id)


def process_one(
    db, analyse: Analyse, workdir: str | None = None, max_attempts: int = MAX_ATTEMPTS, push=None
) -> dict | None:
    """Claim one job and run it to a terminal state (or back into the queue).

    Success: download clip (+ the phone's pose for a pose_source 'device' lift) ->
    analyse -> upload keyframes and the trace -> complete_lift_job -> delete clip -> notify.
    Error with attempts left: fail_lift_job(retry) and keep the clip for the retry.
    Error on the last attempt: fail_lift_job(no retry), delete the clip and notify.
    """
    job = claim(db, max_attempts)
    if job is None:
        return None
    t = {}
    t0 = time.monotonic()
    with tempfile.TemporaryDirectory(dir=workdir) as tmp:
        try:
            clip = os.path.join(tmp, "clip")
            db.download(RAW_BUCKET, job.clip_path, clip)
            pose = fetch_pose(db, job, tmp)
            t["download"] = time.monotonic() - t0
            p0 = cv_pose.pose_seconds
            with cv_trace.recording() as rec:
                result = analyse(clip, job, tmp) if pose is None else analyse(clip, job, tmp, pose=pose)
            t["pose"] = cv_pose.pose_seconds - p0
            t["analysis"] = time.monotonic() - t0 - t["download"] - t["pose"]
            t1 = time.monotonic()
            for path in result.keyframes:
                db.upload(KEYFRAME_BUCKET, f"{job.keyframe_prefix}/{os.path.basename(path)}", path, "image/jpeg")
            traced = save_trace(db, job, rec, result, pose, tmp)
            t["upload"] = time.monotonic() - t1
            out = db.rpc(
                "complete_lift_job", {"p_msg_id": job.msg_id, "p_lift_id": job.lift_id, "p_analysis": result.analysis}
            )
        except Exception as e:
            code = error_code(e)
            retry = job.attempt < max_attempts and code not in FINAL_CODES
            log_timing(job, "error", t, t0)
            log.error("lift %s attempt %s failed (%s): %s", job.lift_id, job.attempt, code, traceback.format_exc())
            status = db.rpc(
                "fail_lift_job",
                {"p_msg_id": job.msg_id, "p_lift_id": job.lift_id, "p_error": code, "p_retry": retry},
            )
            deleted = False if retry else delete_clip(db, job)
            if not retry:
                notify(db, push, job, ok=False)
            return {
                "lift_id": job.lift_id,
                "status": status,
                "error": code,
                "attempt": job.attempt,
                "clip_deleted": deleted,
            }
    deleted = delete_clip(db, job)
    log_timing(job, out["status"], t, t0)
    if out["status"] in ("done", "failed"):
        notify(db, push, job, ok=out["status"] == "done")
    return {
        "lift_id": job.lift_id,
        "status": out["status"],
        "cue_id": out.get("cue_id"),
        "keyframes": len(result.keyframes),
        "trace": traced,
        "clip_deleted": deleted,
    }


def log_timing(job: Job, status: str, t: dict, t0: float) -> None:
    stages = " ".join(f"{k}={v:.1f}s" for k, v in t.items())
    log.info("lift %s %s attempt=%s %s total=%.1fs", job.lift_id, status, job.attempt, stages, time.monotonic() - t0)


def drain(
    db, analyse: Analyse, workdir: str | None = None, limit: int = 100, push=None, budget_s: float | None = None
) -> list[dict]:
    """Process jobs until the queue is empty or `limit` is hit. budget_s: stop claiming new jobs once this many
    seconds have passed, so a call with a timeout never starts a job it cannot finish."""
    start = time.monotonic()
    done = []
    while len(done) < limit:
        if budget_s is not None and time.monotonic() - start >= budget_s:
            log.info("drain budget of %ss spent after %s jobs; the next call picks up the rest", budget_s, len(done))
            break
        r = process_one(db, analyse, workdir, push=push)
        if r is None:
            break
        done.append(r)
    return done
