"""Export the pose models pose.py runs (rtmlib "balanced": YOLOX-m humanart + RTMPose-m body7 halpe26) to Core ML for
modules/pose-coreml, and check each against onnxruntime.

    cd cv && uv run --with coremltools --with onnx2torch --with torch --with onnx python scripts/export_coreml.py \
        [--precision fp32|fp16] [--only YoloxHuman,RTMPoseHalpe26] [--out DIR]

Writes modules/pose-coreml/ios/models/{YoloxHuman,RTMPoseHalpe26}.mlmodelc (gitignored, ~150 MB).
- RTMPose stays FP32: FP16 RTMPose moved the lifter's keypoints by 13 px at p95 and flipped a made/missed call on the
  owner's clips; 8-bit weights (linear or k-means) were worse still (15-10-2026, 5 prepared clips).
- YOLOX at FP16 (--precision fp16 --only YoloxHuman) runs on the Neural Engine (an FP32-typed program never does), but
  on the 5 owner clips it moved the lifter's keypoints 2.3 px p50 / 9.5 px p95 against FP32 (23-10-2026), over the 1 px
  bar: not shipped. The onnxruntime check is report-only at FP16.
- YOLOX is cut before its in-graph TopK/NonMaxSuppression; modules/pose-coreml does that step in Swift.
- YOLOX's 9x9 and 13x13 SPP max-pools are rebuilt as chains of 5x5 (the same values) so the FP16 build stays on the
  Neural Engine end to end.
- onnx2torch cannot read RTMPose's Clip nodes whose optional max is '' ; those empty inputs are dropped (same graph)."""
import argparse
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
ap = argparse.ArgumentParser()
ap.add_argument("--precision", choices=["fp32", "fp16"], default="fp32")
ap.add_argument("--only", default="YoloxHuman,RTMPoseHalpe26")
ap.add_argument("--out", default=os.path.join(ROOT, "modules", "pose-coreml", "ios", "models"))
ARGS = ap.parse_args()
OUT = ARGS.out
cfg = BodyWithFeet.MODE["balanced"]


def split_pools(model):
    # YOLOX's SPP max-pools at 9x9 and 13x13 have no Neural Engine kernel and bounce the program to the CPU twice per
    # frame; a stride-1 "same" max-pool of size 4k+1 is exactly k max-pools of 5x5, which the Neural Engine runs.
    for name, mod in list(model.named_children()):
        k = mod.kernel_size if isinstance(mod, torch.nn.MaxPool2d) else None
        k = k[0] if isinstance(k, (list, tuple)) else k
        if k and k > 5 and (k - 1) % 4 == 0 and list(torch.nn.modules.utils._pair(mod.stride)) == [1, 1]:
            setattr(model, name, torch.nn.Sequential(*[torch.nn.MaxPool2d(5, 1, 2) for _ in range((k - 1) // 4)]))
        else:
            split_pools(mod)
    return model


def coreml(onnx_path, shape, names):
    traced = torch.jit.trace(split_pools(convert(onnx.load(onnx_path))).eval(), torch.rand(*shape) * 255)
    precision = ct.precision.FLOAT16 if ARGS.precision == "fp16" else ct.precision.FLOAT32
    return ct.convert(traced, inputs=[ct.TensorType(name="input", shape=shape)], outputs=[ct.TensorType(name=n) for n in names],
                      compute_precision=precision, compute_units=ct.ComputeUnit.ALL,
                      minimum_deployment_target=ct.target.iOS16, convert_to="mlprogram")


def check(onnx_path, ml, shape, names, scale, shift, tol):
    x = (np.random.default_rng(0).random(shape, dtype=np.float32) * scale + shift).astype(np.float32)
    ref = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"]).run(None, {"input": x})
    got = ml.predict({"input": x})
    for n, r in zip(names, ref):
        err = float(np.abs(got[n].reshape(r.shape) - r).max())
        print(f"{os.path.basename(onnx_path)} {n} ({ARGS.precision}): max abs diff {err:.2e}")
        if err > tol and ARGS.precision == "fp32":
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
        if name not in ARGS.only.split(","):
            continue
        ml = coreml(path, shape, names)
        check(path, ml, shape, names, scale, shift, tol)
        pkg = os.path.join(tmp, name + ".mlpackage")
        ml.save(pkg)
        subprocess.run(["xcrun", "coremlcompiler", "compile", pkg, OUT], check=True, capture_output=True)
        print("wrote", os.path.join(OUT, name + ".mlmodelc"))
