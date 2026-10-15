"""Export the pose models pose.py runs (rtmlib "balanced": YOLOX-m humanart + RTMPose-m body7 halpe26) to Core ML for
modules/pose-coreml, and check each against onnxruntime.

    cd cv && uv run --with coremltools --with onnx2torch --with torch --with onnx python scripts/export_coreml.py

Writes modules/pose-coreml/ios/models/{YoloxHuman,RTMPoseHalpe26}.mlmodelc (gitignored, ~150 MB).
- FP32 on purpose: FP16 RTMPose moved the lifter's keypoints by 13 px at p95 and flipped a made/missed call on the
  owner's clips; 8-bit weights (linear or k-means) were worse still (15-10-2026, 5 prepared clips).
- YOLOX is cut before its in-graph TopK/NonMaxSuppression; modules/pose-coreml does that step in Swift.
- onnx2torch cannot read RTMPose's Clip nodes whose optional max is '' ; those empty inputs are dropped (same graph)."""
import os
import subprocess
import sys
import tempfile

import coremltools as ct
import numpy as np
import onnx
import onnxruntime as ort
import torch
from onnx2torch import convert
from rtmlib import BodyWithFeet
from rtmlib.tools.file import download_checkpoint

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "modules", "pose-coreml", "ios", "models")
cfg = BodyWithFeet.MODE["balanced"]


def coreml(onnx_path, shape, names):
    traced = torch.jit.trace(convert(onnx.load(onnx_path)).eval(), torch.rand(*shape) * 255)
    return ct.convert(traced, inputs=[ct.TensorType(name="input", shape=shape)], outputs=[ct.TensorType(name=n) for n in names],
                      compute_precision=ct.precision.FLOAT32, compute_units=ct.ComputeUnit.ALL,
                      minimum_deployment_target=ct.target.iOS16, convert_to="mlprogram")


def check(onnx_path, ml, shape, names, scale, shift, tol):
    x = (np.random.default_rng(0).random(shape, dtype=np.float32) * scale + shift).astype(np.float32)
    ref = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"]).run(None, {"input": x})
    got = ml.predict({"input": x})
    for n, r in zip(names, ref):
        err = float(np.abs(got[n].reshape(r.shape) - r).max())
        print(f"{os.path.basename(onnx_path)} {n}: max abs diff {err:.2e}")
        if err > tol:
            sys.exit(f"{n} differs from onnxruntime by {err}")


with tempfile.TemporaryDirectory() as tmp:
    det = download_checkpoint(cfg["det"])
    pose = download_checkpoint(cfg["pose"])
    det_cut = os.path.join(tmp, "yolox_cut.onnx")
    onnx.utils.extract_model(det, det_cut, ["input"], ["1436", "1438"])  # xyxy boxes, per-class scores
    pm = onnx.load(pose)
    for node in pm.graph.node:
        while node.input and node.input[-1] == "":
            node.input.pop()
    pose_fixed = os.path.join(tmp, "rtmpose.onnx")
    onnx.save(pm, pose_fixed)

    os.makedirs(OUT, exist_ok=True)
    for name, path, shape, names, scale, shift, tol in (
        ("YoloxHuman", det_cut, (1, 3, 640, 640), ["boxes", "scores"], 255, 0, 1e-2),
        ("RTMPoseHalpe26", pose_fixed, (1, 3, 256, 192), ["simcc_x", "simcc_y"], 4, -2, 1e-4),
    ):
        ml = coreml(path, shape, names)
        check(path, ml, shape, names, scale, shift, tol)
        pkg = os.path.join(tmp, name + ".mlpackage")
        ml.save(pkg)
        subprocess.run(["xcrun", "coremlcompiler", "compile", pkg, OUT], check=True, capture_output=True)
        print("wrote", os.path.join(OUT, name + ".mlmodelc"))
