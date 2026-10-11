from catchline_worker import analyse as mod
from catchline_worker.jobs import Job

JOB = Job(
    msg_id=1, lift_id="lift-9", user_id="user-9", movement="snatch", load_kg=62.5, clip_path="user-9/lift-9", attempt=1
)


def fake_run(clip, out_json, assets_dir, asset_prefix, debug_dir, cache_dir, analysis_id, movement):
    assert movement == "snatch"
    import os

    os.makedirs(assets_dir)
    for name in ("r1-2-first_pull.jpg", "r1-1-setup.jpg"):
        open(os.path.join(assets_dir, name), "wb").close()
    analysis = {
        "version": 1,
        "id": analysis_id,
        "movement": "snatch",
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
    return analysis, [], {}


def test_snatch_runs_the_cv_pipeline_with_bucket_paths(monkeypatch, tmp_path):
    monkeypatch.setattr(mod.pipeline, "run", fake_run)
    r = mod.analyse("clip.mov", JOB, str(tmp_path))
    assert r.analysis["id"] == "lift-9"
    assert r.analysis["loadKg"] == 62.5
    assert r.analysis["video"]["uri"] == "user-9/lift-9"
    assert r.analysis["reps"][0]["keyFrames"][0]["image"] == "user-9/lift-9/r1-1-setup.jpg"
    assert [p.rsplit("/", 1)[1] for p in r.keyframes] == ["r1-1-setup.jpg", "r1-2-first_pull.jpg"]


def test_unsupported_movement_is_a_failure_analysis_without_running_pose(monkeypatch, tmp_path):
    monkeypatch.setattr(mod, "probe", lambda clip: {"width": 1080, "height": 1920, "fps": 60.0, "frameCount": 600})

    def boom(*a):
        raise AssertionError("pose must not run")

    monkeypatch.setattr(mod.pipeline, "run", boom)
    r = mod.analyse("clip.mov", Job(**{**JOB.__dict__, "movement": "ring_muscle_up", "load_kg": None}), str(tmp_path))
    assert r.keyframes == []
    assert r.analysis["movement"] == "ring_muscle_up"
    assert r.analysis["failure"] == {
        "reason": "unsupported_movement",
        "message": "ring muscle up analysis is not available yet.",
    }
    assert r.analysis["video"] == {"uri": "user-9/lift-9", "width": 608, "height": 1080, "fps": 60.0, "frameCount": 600}
    assert "loadKg" not in r.analysis
