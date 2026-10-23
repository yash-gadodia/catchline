"""The phone's pose (fixtures/2026-10-05_21B27BAF.mp4.pose.json.gz: modules/pose-coreml's code run on the owner's
prepared clip on a Mac, as the app uploads it) turned back into run_pose's output."""
import glob
import gzip
import json
import os

import numpy as np
import pytest

from catchline_cv import external_pose as ep
from catchline_cv import pipeline
from catchline_cv.pose import HEAD, L_ANK, L_WRI

NAME = "2026-10-05_21B27BAF.mp4"
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", NAME + ".pose.json.gz")
META = {"width": 608, "height": 1080, "fps": 30.0, "frameCount": 153, "rotation": 0}


@pytest.fixture(scope="module")
def pose():
    with gzip.open(FIXTURE, "rt") as fh:
        return json.load(fh)


def test_one_list_per_video_frame_at_inference_size(pose):
    people, shape = ep.to_people(pose, META, 1280)
    assert shape == (1280, 720, 3)
    assert len(people) == 153
    assert len(people[60]) == 5


def test_people_keep_the_halpe26_layout_unchanged(pose):
    people, _ = ep.to_people(pose, META, 1280)
    box, k, s = people[60][1]
    assert box.tolist() == [44.2, 413.2, 536.5, 1009.9]
    assert k[L_WRI].tolist() == [372.1, 844.6]
    assert s[L_WRI] == 0.341
    assert k[L_ANK].tolist() == [269.5, 883.1]
    assert s[L_ANK] == 0.659
    assert k.shape == (26, 2) and s.shape == (26,)
    assert np.isnan(k[list(HEAD)]).all() and (s[list(HEAD)] == 0).all()


def test_a_pose_at_another_height_is_scaled_to_the_inference_frame():
    pose = {"fps": 30, "width": 360, "height": 640,
            "frames": [{"t": 0, "people": [{"box": [10, 20, 30, 40], "kp": [None] * 5 + [[100, 200, 0.9]] + [None] * 20}]}]}
    people, shape = ep.to_people(pose, {"width": 608, "height": 1080, "fps": 30.0, "frameCount": 1}, 1280)
    box, k, s = people[0][0]
    assert shape == (1280, 720, 3)
    assert box.tolist() == [20, 40, 60, 80]
    assert k[5].tolist() == [200, 400] and s[5] == 0.9


def test_subsampled_frames_are_placed_by_time(pose):
    half = dict(pose, frames=pose["frames"][::2])
    people, _ = ep.to_people(half, META, 1280)
    assert len(people) == 153
    assert [len(p) > 0 for p in people[:4]] == [True, False, True, False]
    assert people[60][1][1][L_WRI].tolist() == [372.1, 844.6]


CLIPS = os.environ.get("CATCHLINE_CLIPS")


@pytest.mark.skipif(not CLIPS, reason="CATCHLINE_CLIPS not set")
def test_pipeline_runs_on_the_phone_pose_without_rtmpose(pose, tmp_path, monkeypatch):
    clip = os.path.join(CLIPS, NAME)
    if not os.path.exists(clip):
        pytest.skip(f"{clip} not present")

    def no_rtmpose(*a, **k):
        raise AssertionError("RTMPose ran")

    monkeypatch.setattr(pipeline, "run_pose", no_rtmpose)
    os.makedirs(tmp_path / "debug")
    res = pipeline.run(clip, str(tmp_path / "analysis.json"), str(tmp_path / "keyframes"), "kf", str(tmp_path / "debug"),
                       str(tmp_path / "cache"), "device", "snatch", external=pose)
    analysis = json.load(open(tmp_path / "analysis.json"))
    assert (res if isinstance(res, dict) else res[0]) == analysis
    assert analysis["failure"] is None
    assert [(r["startFrame"], r["endFrame"], r["made"]) for r in analysis["reps"]] == [(31, 145, False)]
    assert analysis["cue"]["faultId"] == "missed_forward"
    assert len(glob.glob(str(tmp_path / "keyframes" / "*.jpg"))) == 7


def test_load_accepts_the_phone_pose(pose, tmp_path):
    path = tmp_path / "pose.json"
    path.write_text(json.dumps(pose))
    assert ep.load(str(path)) == pose


# #79: a pose that parses but is not one must not reach the pipeline.
@pytest.mark.parametrize("bad", [{"frames": "garbage"}, [], {"fps": 30, "width": 360, "height": 0, "frames": []},
                                 {"fps": 30, "width": 360, "height": 640, "frames": [{"t": 0, "people": [{"box": [], "kp": []}]}]}])
def test_load_rejects_what_is_not_a_device_pose(bad, tmp_path):
    path = tmp_path / "pose.json"
    path.write_text(json.dumps(bad))
    with pytest.raises(ValueError, match="not a device pose"):
        ep.load(str(path))
