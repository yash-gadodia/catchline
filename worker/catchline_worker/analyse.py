import glob
import os

from catchline_cv import pipeline
from catchline_cv.video import probe

from .jobs import Job, Result

SUPPORTED = {"snatch", "clean", "jerk", "kipping_pull_up", "bar_muscle_up", "kipping_hspu"}


def analyse(clip: str, job: Job, workdir: str) -> Result:
    """Run the catchline_cv pipeline on one clip. Keyframe image paths in the JSON are
    keyframes-bucket object names ('<user_id>/<lift_id>/<file>.jpg'), uploaded by the caller."""
    if job.movement not in SUPPORTED:
        analysis = pipeline.base(job.lift_id, probe(clip), 0) | {
            "movement": job.movement,
            "reps": [],
            "bestRepIndex": 0,
            "cue": None,
            "measurements": [],
            "failure": {
                "reason": "unsupported_movement",
                "message": f"{job.movement.replace('_', ' ')} analysis is not available yet.",
            },
        }
        return Result(_finish(analysis, job), [])

    keyframes_dir = os.path.join(workdir, "keyframes")
    debug_dir = os.path.join(workdir, "debug")
    os.makedirs(debug_dir, exist_ok=True)
    res = pipeline.run(
        clip,
        os.path.join(workdir, "analysis.json"),
        keyframes_dir,
        job.keyframe_prefix,
        debug_dir,
        os.path.join(workdir, "cache"),
        job.lift_id,
        job.movement,
    )
    analysis = res if isinstance(res, dict) else res[0]
    return Result(_finish(analysis, job), sorted(glob.glob(os.path.join(keyframes_dir, "*.jpg"))))


def _finish(analysis: dict, job: Job) -> dict:
    analysis["id"] = job.lift_id
    analysis["video"]["uri"] = job.keyframe_prefix
    if job.load_kg is not None:
        analysis["loadKg"] = float(job.load_kg)
    return analysis
