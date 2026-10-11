"""Draw an Analysis JSON's own normalised path + evidence onto its exported keyframes (checks the contract, not internals)."""
import json, os, sys
import cv2, numpy as np
a = json.load(open(sys.argv[1])); root = sys.argv[2]; out = sys.argv[3]
tiles = []
for rep in a["reps"]:
    for kf in rep["keyFrames"]:
        im = cv2.imread(os.path.join(root, kf["image"]))
        h, w = im.shape[:2]
        pts = [(int(p["x"] * w), int(p["y"] * h)) for p in rep["path"] if p["frame"] <= kf["frame"]]
        for p, q in zip(pts, pts[1:]):
            cv2.line(im, p, q, (0, 0, 255), 3)
        for p in rep["path"]:
            if p["frame"] == kf["frame"]:
                cv2.circle(im, (int(p["x"] * w), int(p["y"] * h)), 9, (0, 255, 0), -1)
        ev = a["cue"]["evidence"] if a["cue"] else None
        if ev and ev["rep"] == rep["index"] and ev["frame"] == kf["frame"]:
            f, t = ev["from"], ev["to"]
            cv2.arrowedLine(im, (int(f["x"] * w), int(f["y"] * h)), (int(t["x"] * w), int(t["y"] * h)), (255, 255, 0), 4, tipLength=0.3)
            cv2.putText(im, ev["caption"], (20, h - 40), 0, 1.2, (255, 255, 0), 3)
        cv2.putText(im, f"rep{rep['index']} {kf['phase']} f{kf['frame']}", (20, 50), 0, 1.2, (0, 255, 255), 3)
        tiles.append(cv2.resize(im, (304, 540)))
rows = [np.hstack(tiles[i:i + 7]) for i in range(0, len(tiles), 7)]
cv2.imwrite(out, np.vstack(rows))
print("ok", len(tiles), "tiles")
