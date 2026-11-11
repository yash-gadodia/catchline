"""Draws what the 4.0 player shows onto a clip, for looking at a tracking result off the phone.
  python render40.py CLIP DIR   (DIR holds analysis.json + body.json; writes DIR/overlay.mp4 and DIR/sheet.jpg)"""
import json, sys
import cv2
import numpy as np

clip, d = sys.argv[1], sys.argv[2]
a = json.load(open(f"{d}/analysis.json"))
body = json.load(open(f"{d}/body.json"))
frames = (body or {}).get("frames") or []
rep = (a.get("reps") or [{}])[0]
path = rep.get("path") or []
cap = cv2.VideoCapture(clip)
fps = cap.get(cv2.CAP_PROP_FPS) or 30
out = None
FLARE, BONE, BLACK = (61, 31, 255), (225, 233, 237), (0, 0, 0)
BONES = [(0, 2), (2, 4), (0, 6), (6, 8), (8, 10), (10, 12), (12, 14)]
off = (a.get("noCueReason") or {}).get("offSideDeg")
seen = [0, 0]
for r in frames:
    for i in range(0, len(r), 2):
        if r[i] is not None: seen[(i // 2) % 2] += 1
sides = [1 if seen[1] > seen[0] else 0] if off is not None and off <= 30 else [0, 1]
floor = None
for r in frames:
    ys = [r[i * 2 + 1] for i in (12, 13, 14, 15) if r[i * 2 + 1] is not None]
    if len(ys) >= 2:
        floor = max(ys); break
keep, f, n = [], 0, int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
while True:
    ok, img = cap.read()
    if not ok: break
    h0, w0 = img.shape[:2]
    s = 960 / h0
    img = cv2.resize(img, (int(w0 * s) // 2 * 2, 960))
    h, w = img.shape[:2]
    P = lambda x, y: (int(x * w), int(y * h))
    if path:
        x = P((rep.get("guides") or {}).get("startX", path[0]["x"]), 0)[0]
        for y in range(0, h, 14): cv2.line(img, (x, y), (x, y + 4), BONE, 1)
    if floor is not None:
        y = P(0, floor)[1]
        for x in range(0, w, 14): cv2.line(img, (x, y), (x + 4, y), BONE, 1)
    if f < len(frames):
        r = frames[f]
        J = [None if r[i] is None else P(r[i], r[i + 1]) for i in range(0, len(r), 2)]
        for sd in sides:
            for p, q in BONES:
                if J[p + sd] and J[q + sd]:
                    cv2.line(img, J[p + sd], J[q + sd], BLACK, 6, cv2.LINE_AA)
                    cv2.line(img, J[p + sd], J[q + sd], BONE, 3, cv2.LINE_AA)
    pts = [P(p["x"], p["y"]) for p in path if p["frame"] <= f]
    if len(pts) > 1:
        cv2.polylines(img, [np.array(pts)], False, BLACK, 7, cv2.LINE_AA)
        cv2.polylines(img, [np.array(pts)], False, FLARE, 4, cv2.LINE_AA)
    cur = [p for p in path if p["frame"] == f]
    if cur:
        cv2.circle(img, P(cur[0]["x"], cur[0]["y"]), 8, BLACK, -1, cv2.LINE_AA)
        cv2.circle(img, P(cur[0]["x"], cur[0]["y"]), 6, FLARE if cur[0].get("src") == "plate" else BONE, -1, cv2.LINE_AA)
    cv2.putText(img, f"{f + 1}", (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, BONE, 2)
    if out is None: out = cv2.VideoWriter(f"{d}/overlay.mp4", cv2.VideoWriter_fourcc(*"avc1"), fps, (w, h))
    out.write(img)
    if n and f in {int(n * k / 8 + n / 16) for k in range(8)}: keep.append(cv2.resize(img, (w // 2, h // 2)))
    f += 1
if out: out.release()
if keep:
    while len(keep) < 8: keep.append(np.zeros_like(keep[0]))
    cv2.imwrite(f"{d}/sheet.jpg", np.vstack([np.hstack(keep[:4]), np.hstack(keep[4:8])]), [cv2.IMWRITE_JPEG_QUALITY, 80])
print(d, f, "frames", "video", n)
