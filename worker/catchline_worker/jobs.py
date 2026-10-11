import logging
import os
import tempfile
import traceback
from collections.abc import Callable
from dataclasses import dataclass

log = logging.getLogger("catchline_worker")

RAW_BUCKET = "raw-clips"
KEYFRAME_BUCKET = "keyframes"
MAX_ATTEMPTS = 3
VISIBILITY_S = 600


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


@dataclass(frozen=True)
class Result:
    analysis: dict
    keyframes: list[str]


Analyse = Callable[[str, Job, str], Result]


def claim(db, max_attempts: int = MAX_ATTEMPTS) -> Job | None:
    rows = db.rpc("claim_lift_job", {"p_vt": VISIBILITY_S, "p_max_attempts": max_attempts})
    return Job(**rows[0]) if rows else None


def delete_clip(db, job: Job) -> bool:
    """Delete the raw clip and record it. If Storage is unreachable the clip stays for
    purge_storage (the pg_cron backstop) to remove within 24 h, so this logs instead of raising."""
    try:
        db.remove(RAW_BUCKET, [job.clip_path])
        db.rpc("mark_clip_deleted", {"p_lift_id": job.lift_id})
        return True
    except Exception:
        log.exception("raw clip delete failed for lift %s; purge_storage will remove it", job.lift_id)
        return False


def process_one(db, analyse: Analyse, workdir: str | None = None, max_attempts: int = MAX_ATTEMPTS) -> dict | None:
    """Claim one job and run it to a terminal state (or back into the queue).

    Success: download clip -> analyse -> upload keyframes -> complete_lift_job -> delete clip.
    Error with attempts left: fail_lift_job(retry) and keep the clip for the retry.
    Error on the last attempt: fail_lift_job(no retry) and delete the clip.
    """
    job = claim(db, max_attempts)
    if job is None:
        return None
    with tempfile.TemporaryDirectory(dir=workdir) as tmp:
        try:
            clip = os.path.join(tmp, "clip")
            db.download(RAW_BUCKET, job.clip_path, clip)
            result = analyse(clip, job, tmp)
            for path in result.keyframes:
                db.upload(KEYFRAME_BUCKET, f"{job.keyframe_prefix}/{os.path.basename(path)}", path, "image/jpeg")
            out = db.rpc(
                "complete_lift_job", {"p_msg_id": job.msg_id, "p_lift_id": job.lift_id, "p_analysis": result.analysis}
            )
        except Exception as e:
            retry = job.attempt < max_attempts
            log.error("lift %s attempt %s failed: %s", job.lift_id, job.attempt, traceback.format_exc())
            status = db.rpc(
                "fail_lift_job",
                {
                    "p_msg_id": job.msg_id,
                    "p_lift_id": job.lift_id,
                    "p_error": f"{type(e).__name__}: {e}",
                    "p_retry": retry,
                },
            )
            deleted = False if retry else delete_clip(db, job)
            return {
                "lift_id": job.lift_id,
                "status": status,
                "error": f"{type(e).__name__}: {e}",
                "attempt": job.attempt,
                "clip_deleted": deleted,
            }
    return {
        "lift_id": job.lift_id,
        "status": out["status"],
        "cue_id": out.get("cue_id"),
        "keyframes": len(result.keyframes),
        "clip_deleted": delete_clip(db, job),
    }


def drain(db, analyse: Analyse, workdir: str | None = None, limit: int = 100) -> list[dict]:
    done = []
    while len(done) < limit:
        r = process_one(db, analyse, workdir)
        if r is None:
            break
        done.append(r)
    return done
