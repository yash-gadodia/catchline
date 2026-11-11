"""PlateNet weights -> Core ML (ML Program, FP16), then times one 256x256 crop per compute-unit setting.
  python export_coreml.py WEIGHTS OUT.mlpackage"""
import os, sys, time
import numpy as np
import torch
import coremltools as ct
from PIL import Image
from platenet import PlateNet

weights, out = sys.argv[1:3]
model = PlateNet(pretrained=False).eval()
model.load_state_dict(torch.load(weights, map_location="cpu"))
ex = torch.rand(1, 3, 256, 256)
traced = torch.jit.trace(model, ex)
ml = ct.convert(traced, inputs=[ct.ImageType(name="crop", shape=ex.shape, scale=1 / 255.0, color_layout=ct.colorlayout.RGB)],
                outputs=[ct.TensorType(name="maps")], convert_to="mlprogram", compute_precision=ct.precision.FLOAT16,
                minimum_deployment_target=ct.target.iOS16)
ml.save(out)
size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs)
print(f"saved {out} {size / 1e6:.2f} MB")
img = Image.fromarray((np.random.rand(256, 256, 3) * 255).astype(np.uint8))
x = torch.from_numpy(np.asarray(img).copy()).permute(2, 0, 1)[None].float() / 255
ref = model(x).detach().numpy()
for name, cu in (("ALL (CPU+GPU+NE)", ct.ComputeUnit.ALL), ("CPU+NE", ct.ComputeUnit.CPU_AND_NE), ("CPU+GPU", ct.ComputeUnit.CPU_AND_GPU), ("CPU only", ct.ComputeUnit.CPU_ONLY)):
    m = ct.models.MLModel(out, compute_units=cu)
    for _ in range(10): o = m.predict({"crop": img})
    ts = []
    for _ in range(200):
        t = time.perf_counter(); o = m.predict({"crop": img}); ts.append((time.perf_counter() - t) * 1000)
    d = np.abs(o["maps"] - ref)
    print(f"{name:18s} median {np.median(ts):.2f} ms  p90 {np.percentile(ts, 90):.2f} ms  max |diff| vs torch: heat logit {d[0, 0].max():.3f} offsets {d[0, 1:3].max():.3f} log r {d[0, 3].max():.3f}")
