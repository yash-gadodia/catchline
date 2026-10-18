from types import SimpleNamespace

import numpy as np
import onnxruntime as ort
import rtmlib
from catchline_cv import pose


class FakeModel:
    built = []

    def __init__(self, onnx_model, **kw):
        self.onnx_model = onnx_model
        FakeModel.built.append(onnx_model)

    def __call__(self, img, bboxes=None):
        if bboxes is None:
            return np.array([[0.0, 0.0, 10.0, 10.0]])
        return np.zeros((1, 26, 2)), np.ones((1, 26))


def test_run_pose_builds_the_models_once_per_process(monkeypatch):
    FakeModel.built = []
    sessions = []
    monkeypatch.setattr(rtmlib, "YOLOX", FakeModel)
    monkeypatch.setattr(rtmlib, "RTMPose", FakeModel)
    monkeypatch.setattr(ort, "InferenceSession", lambda path, **kw: sessions.append(path) or path)
    monkeypatch.setattr(pose, "frames", lambda path, height: iter([(0, np.zeros((20, 20, 3), np.uint8))]))
    monkeypatch.setattr(pose, "_MODELS", {})

    first, shape = pose.run_pose("a.mp4", 1280)
    second, _ = pose.run_pose("b.mp4", 1280)

    cfg = rtmlib.BodyWithFeet.MODE["balanced"]
    assert FakeModel.built == [cfg["det"], cfg["pose"]]
    assert sessions == [cfg["det"], cfg["pose"]]
    assert shape == (20, 20, 3)
    assert len(first) == len(second) == 1
    assert first[0][0][2].tolist() == second[0][0][2].tolist()


def test_run_pose_adds_its_wall_time_to_pose_seconds(monkeypatch):
    monkeypatch.setattr(pose, "_MODELS", {"balanced": (FakeModel("d"), FakeModel("p"))})
    monkeypatch.setattr(pose, "frames", lambda path, height: iter([]))
    clock = iter([10.0, 12.5])
    monkeypatch.setattr(pose, "time", SimpleNamespace(monotonic=lambda: next(clock)))
    monkeypatch.setattr(pose, "pose_seconds", 1.0)
    pose.run_pose("a.mp4", 1280)
    assert pose.pose_seconds == 3.5
