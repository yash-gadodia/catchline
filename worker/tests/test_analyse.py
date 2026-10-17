import os

import pytest

from catchline_worker import analyse as mod
from catchline_worker.jobs import Job

JOB = Job(
    msg_id=1, lift_id="lift-9", user_id="user-9", movement="snatch", load_kg=62.5, clip_path="user-9/lift-9", attempt=1
)


def with_movement(movement):
    return Job(**{**JOB.__dict__, "movement": movement})


def fake_run(clip, out_json, assets_dir, asset_prefix, debug_dir, cache_dir, analysis_id, movement, detected=None,
             external=None):
    os.makedirs(assets_dir)
    for name in ("r1-2-first_pull.jpg", "r1-1-setup.jpg"):
        open(os.path.join(assets_dir, name), "wb").close()
    analysis = {
        "version": 1,
        "id": analysis_id,
        "movement": movement,
        "video": {
            "uri": f"assets/analysis/{analysis_id}",
            "width": 608,
            "height": 1080,
            "fps": 30.0,
            "frameCount": 300,
        },
        "reps": [{"keyFrames": [{"phase": "setup", "frame": 1, "image": f"{asset_prefix}/r1-1-setup.jpg"}]}],
        "cue": None,
        "failure": None,
    }
    if detected is not None:
        analysis["detectedMovement"] = {"movement": detected["movement"], "confidence": detected["confidence"]}
    return analysis, [], {}


@pytest.fixture
def detected(monkeypatch):
    """Stub the pose-only detector; the test sets what it finds. Records the cache dir it was given."""
    seen = {}

    def fake_detect(clip, cache_dir, external=None):
        seen["cache_dir"] = cache_dir
        seen["external"] = external
        return seen["result"]

    monkeypatch.setattr(mod.pipeline, "detect_movement", fake_detect)
    monkeypatch.setattr(mod.pipeline, "run", fake_run)
    return seen


def test_snatch_runs_the_cv_pipeline_with_bucket_paths(detected, tmp_path):
    detected["result"] = {"movement": "snatch", "confidence": 0.9, "lifts": []}
    r = mod.analyse("clip.mov", JOB, str(tmp_path))
    assert r.analysis["id"] == "lift-9"
    assert r.analysis["loadKg"] == 62.5
    assert r.analysis["video"]["uri"] == "user-9/lift-9"
    assert r.analysis["reps"][0]["keyFrames"][0]["image"] == "user-9/lift-9/r1-1-setup.jpg"
    assert [p.rsplit("/", 1)[1] for p in r.keyframes] == ["r1-1-setup.jpg", "r1-2-first_pull.jpg"]
    assert (r.analysis["movement"], r.analysis["movementUsed"]) == ("snatch", "snatch")
    assert r.analysis["detectedMovement"] == {"movement": "snatch", "confidence": 0.9}
    assert detected["cache_dir"] == os.path.join(str(tmp_path), "cache")


def test_every_analysis_carries_the_cv_version_and_the_worker_revision(detected, monkeypatch, tmp_path):
    monkeypatch.setattr(mod, "worker_version", lambda: "807270d")
    detected["result"] = {"movement": "snatch", "confidence": 0.9, "lifts": []}
    r = mod.analyse("clip.mov", JOB, str(tmp_path))
    assert (r.analysis["analysisVersion"], r.analysis["analysisRevision"]) == ("cv-2026.10.17", "807270d")


def test_a_confident_disagreement_runs_the_detected_rule_set_and_keeps_the_choice(detected, tmp_path):
    # prod 14-10-2026: a clean uploaded with the selector left on snatch got a snatch analysis
    detected["result"] = {"movement": "clean", "confidence": 0.9, "lifts": []}
    r = mod.analyse("clip.mov", JOB, str(tmp_path))
    assert r.analysis["movement"] == "snatch"
    assert r.analysis["movementUsed"] == "clean"
    assert r.analysis["detectedMovement"] == {"movement": "clean", "confidence": 0.9}


def test_a_weak_disagreement_keeps_the_client_rule_set_and_records_the_doubt(detected, tmp_path):
    detected["result"] = {"movement": "clean", "confidence": 0.7, "lifts": []}
    r = mod.analyse("clip.mov", JOB, str(tmp_path))
    assert (r.analysis["movement"], r.analysis["movementUsed"]) == ("snatch", "snatch")
    assert r.analysis["detectedMovement"] == {"movement": "clean", "confidence": 0.7}


def test_the_override_threshold_is_inclusive(detected, tmp_path):
    detected["result"] = {"movement": "jerk", "confidence": 0.8, "lifts": []}
    r = mod.analyse("clip.mov", with_movement("clean"), str(tmp_path))
    assert (r.analysis["movement"], r.analysis["movementUsed"]) == ("clean", "jerk")


def test_unknown_never_overrides(detected, tmp_path):
    detected["result"] = {"movement": "unknown", "confidence": 0.0, "lifts": []}
    r = mod.analyse("clip.mov", JOB, str(tmp_path))
    assert (r.analysis["movement"], r.analysis["movementUsed"]) == ("snatch", "snatch")
    assert r.analysis["detectedMovement"] == {"movement": "unknown", "confidence": 0.0}


def test_gymnastics_jobs_skip_the_barbell_detector(monkeypatch, tmp_path):
    def boom(*a):
        raise AssertionError("the barbell detector must not run for a gymnastics job")

    monkeypatch.setattr(mod.pipeline, "detect_movement", boom)
    monkeypatch.setattr(mod.pipeline, "run", fake_run)
    r = mod.analyse("clip.mov", with_movement("kipping_pull_up"), str(tmp_path))
    assert (r.analysis["movement"], r.analysis["movementUsed"]) == ("kipping_pull_up", "kipping_pull_up")
    assert "detectedMovement" not in r.analysis


def test_unsupported_movement_is_a_failure_analysis_without_running_pose(monkeypatch, tmp_path):
    monkeypatch.setattr(mod, "probe", lambda clip: {"width": 1080, "height": 1920, "fps": 60.0, "frameCount": 600})

    def boom(*a):
        raise AssertionError("pose must not run")

    monkeypatch.setattr(mod.pipeline, "run", boom)
    monkeypatch.setattr(mod.pipeline, "detect_movement", boom)
    r = mod.analyse("clip.mov", Job(**{**JOB.__dict__, "movement": "ring_muscle_up", "load_kg": None}), str(tmp_path))
    assert r.keyframes == []
    assert r.analysis["movement"] == "ring_muscle_up"
    assert r.analysis["failure"] == {
        "reason": "unsupported_movement",
        "code": "not_available",
        "message": "ring muscle up analysis is not available yet.",
    }
    assert r.analysis["video"] == {"uri": "user-9/lift-9", "width": 608, "height": 1080, "fps": 60.0, "frameCount": 600}
    assert "loadKg" not in r.analysis
    assert "movementUsed" not in r.analysis
    assert r.analysis["analysisVersion"] == "cv-2026.10.17"


def test_the_phone_pose_reaches_the_detector_and_the_pipeline(detected, monkeypatch, tmp_path):
    detected["result"] = {"movement": "snatch", "confidence": 0.9, "lifts": []}
    pose = {"source": "apple-vision", "frames": []}
    ran = {}

    def run_recording(*a, external=None, **k):
        ran["external"] = external
        return fake_run(*a, **k)

    monkeypatch.setattr(mod.pipeline, "run", run_recording)
    r = mod.analyse("clip.mov", JOB, str(tmp_path), pose=pose)
    assert detected["external"] is pose
    assert ran["external"] is pose
    assert r.analysis["movementUsed"] == "snatch"


def test_without_a_phone_pose_the_pipeline_runs_its_own(detected, tmp_path):
    detected["result"] = {"movement": "snatch", "confidence": 0.9, "lifts": []}
    mod.analyse("clip.mov", JOB, str(tmp_path))
    assert detected["external"] is None
