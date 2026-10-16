import glob
import os

from catchline_cv import ANALYSIS_VERSION, pipeline
from catchline_cv.video import probe

from .heartbeat import worker_version
from .jobs import Job, Result

SUPPORTED = {"snatch", "clean", "jerk", "kipping_pull_up", "bar_muscle_up", "kipping_hspu"}
BARBELL = {"snatch", "clean", "jerk"}
# the detector's reads are 0.9 (strong) and 0.7 (weak) per lift, averaged and scaled by how many lifts agree
CONFIDENT = 0.8


def analyse(clip: str, job: Job, workdir: str, pose: dict | None = None) -> Result:
    """Run the catchline_cv pipeline on one clip. Keyframe image paths in the JSON are
    keyframes-bucket object names ('<user_id>/<lift_id>/<file>.jpg'), uploaded by the caller.

    The client's movement is a claim, not a fact (a clean uploaded with the selector left on snatch got a snatch
    analysis). For barbell jobs the pose-only detector runs first; a confident disagreement runs the detected
    movement's rule set instead, and the analysis records both the choice and what was used.

    pose: the phone's body pose (catchline_cv.external_pose), used instead of running RTMPose here."""
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
    cache_dir = os.path.join(workdir, "cache")
    os.makedirs(debug_dir, exist_ok=True)
    movement, detected = job.movement, None
    if job.movement in BARBELL:
        detected = pipeline.detect_movement(clip, cache_dir, external=pose)
        found = detected["movement"]
        if found in BARBELL and found != job.movement and detected["confidence"] >= CONFIDENT:
            movement = found
    res = pipeline.run(
        clip,
        os.path.join(workdir, "analysis.json"),
        keyframes_dir,
        job.keyframe_prefix,
        debug_dir,
        cache_dir,
        job.lift_id,
        movement,
        detected=detected,
        external=pose,
    )
    analysis = res if isinstance(res, dict) else res[0]
    analysis["movementUsed"] = movement
    return Result(_finish(analysis, job), sorted(glob.glob(os.path.join(keyframes_dir, "*.jpg"))))


def _finish(analysis: dict, job: Job) -> dict:
    analysis["id"] = job.lift_id
    analysis["movement"] = job.movement
    analysis["video"]["uri"] = job.keyframe_prefix
    analysis["analysisVersion"] = ANALYSIS_VERSION
    analysis["analysisRevision"] = worker_version()
    if job.load_kg is not None:
        analysis["loadKg"] = float(job.load_kg)
    return analysis
