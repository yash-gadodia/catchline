import argparse
import json
import os
import time

from catchline_cv import debug, pipeline

ap = argparse.ArgumentParser(description="Analyse one snatch clip -> Analysis JSON (v1)")
ap.add_argument("clip")
ap.add_argument("--id", required=True)
ap.add_argument("--out", default="out")
ap.add_argument("--no-video", action="store_true")
a = ap.parse_args()

out = os.path.join(a.out, a.id)
os.makedirs(os.path.join(out, "debug"), exist_ok=True)
res = pipeline.run(a.clip, os.path.join(out, f"{a.id}.json"), os.path.join(out, "keyframes"),
                   f"assets/analysis/{a.id}", os.path.join(out, "debug"), os.path.join(a.out, "cache"), a.id)
if isinstance(res, dict):
    print("FAILURE", json.dumps(res["failure"]))
    raise SystemExit(0)
analysis, reps, timing = res
t = time.time()
for r in reps:
    d = os.path.join(out, "debug", f"rep{r['index']}")
    debug.contact_sheet(r, d + "-sheet.jpg")
    debug.contact_sheet(r, d + "-catch.jpg", extra=range(r["events"]["peak"] - 9, r["events"]["caught"] + 4, 3))
    debug.signal_plot(r, d + "-signals.png")
    if not a.no_video:
        debug.render_video(r, d + "-overlay.mp4", analysis["video"]["fps"])
    print(json.dumps({k: v for k, v in r.items() if not k.startswith("_") and k not in ("path", "plates", "phases")}, default=float))
    print("plates", [(p["side"], [round(float(c)) for c in p["centre"]], [round(x) for x in p["axes"]], round(p.get("axes_spread", -1), 3)) for p in r["plates"]])
print(json.dumps(analysis["cue"], indent=1, ensure_ascii=False))
print("timing", timing, "debug_s", round(time.time() - t, 1))
