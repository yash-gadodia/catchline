"""Held-out table: PlateNet against the rule tracker on the hand-labelled frames.
  python evaltest.py DATA HAND.json WEIGHTS [--thr 0.3] [--smooth] [--dump DIR]
HAND.json[id][frame] = [x, y, r, gripped] in crop px, or "oof" when the plate centre is outside the video frame or crop.
Rules = the pipeline's drawn path point on frames it reads off the plate (meta autop, src plate; tapp = the tap-seeded
run); frames where it falls back to the wrists count as 'says no plate' and their error is listed apart (wrist-path).
Negative clips (no barbell) are scored on every extracted frame."""
import json, os, sys
import cv2
import numpy as np
import torch
from platenet import PlateNet, decode

data, hand_path, weights = sys.argv[1:4]
thr = float(sys.argv[sys.argv.index("--thr") + 1]) if "--thr" in sys.argv else 0.3
dump = sys.argv[sys.argv.index("--dump") + 1] if "--dump" in sys.argv else None
NEG = ["IMG_1179", "2026-09-20_A92852F6-D8FE-4EC2-B049-ED75AA6F05CC", "2026-09-22_3FB05CFF"]
hand = json.load(open(hand_path))
dev = "mps" if torch.backends.mps.is_available() else "cpu"
model = PlateNet(pretrained=False).to(dev).eval()
model.load_state_dict(torch.load(weights, map_location=dev))


def crop(cid, f):
    ctx = cv2.imread(f"{data}/ctx/{cid}/{f:05d}.jpg")
    return ctx[64:320, 64:320]


@torch.no_grad()
def predict(cid, frames):
    out = {}
    for i in range(0, len(frames), 64):
        fs = frames[i:i + 64]
        x = torch.from_numpy(np.stack([crop(cid, f)[:, :, ::-1] for f in fs]).copy()).permute(0, 3, 1, 2).float().div(255).to(dev)
        conf, px, py, pr = [v.cpu().numpy() for v in decode(model(x))]
        for j, f in enumerate(fs):
            out[f] = (float(conf[j]), float(px[j]), float(py[j]), float(pr[j]))
    return out


def smooth(pred, frames):
    """per-clip pass: drop low-confidence frames, reject jumps against a running median, median-of-5 the rest"""
    fs = [f for f in frames if pred[f][0] >= thr]
    out = {}
    for i, f in enumerate(fs):
        nb = [pred[g] for g in fs[max(0, i - 4):i + 5]]
        mx, my, mr = (float(np.median([p[k] for p in nb])) for k in (1, 2, 3))
        c, x, y, r = pred[f]
        if np.hypot(x - mx, y - my) > 1.0 * mr and len(nb) >= 5:
            continue
        w = [pred[g] for g in fs[max(0, i - 2):i + 3] if np.hypot(pred[g][1] - mx, pred[g][2] - my) <= 1.0 * mr]
        out[f] = (c, float(np.median([p[1] for p in w])), float(np.median([p[2] for p in w])), float(np.median([p[3] for p in w])))
    return out


def stat(errs, n):
    e = np.array(errs)
    return f"{100 * (e <= 0.25).sum() / n:3.0f}% {100 * (e <= 0.5).sum() / n:3.0f}% {100 * (n - len(e)) / n:3.0f}%" if n else "  -    -    - "


rows, tot = [], {}
print(f"thr {thr}   columns per method: within 0.25 r | within 0.5 r | says no plate   (share of hand-labelled frames)")
for cid, labs in hand.items():
    m = json.load(open(f"{data}/meta/{cid}.json"))
    by = {r["f"]: r for r in m["frames"]}
    allf = [r["f"] for r in m["frames"]]
    raw = predict(cid, allf)
    sm = smooth(raw, allf)
    pos = {int(f): l for f, l in labs.items() if isinstance(l, list)}
    oof = [int(f) for f, l in labs.items() if not isinstance(l, list)]
    e = {k: [] for k in ("model", "smooth", "auto", "tap", "autow", "gmodel", "gauto", "gtap")}
    rerr = []
    tot["gn"] = tot.get("gn", 0) + sum(l[3] for l in pos.values())
    for f, l in pos.items():
        r = by[f]
        if raw[f][0] >= thr:
            e["model"].append(np.hypot(raw[f][1] - l[0], raw[f][2] - l[1]) / l[2]); rerr.append(abs(raw[f][3] - l[2]) / l[2])
            if l[3]: e["gmodel"].append(e["model"][-1])
        for k in ("auto", "tap"):
            if l[3] and k + "p" in r and r[k + "p"][2] == "plate":
                s = 384 / r["side"]
                e["g" + k].append(np.hypot((r[k + "p"][0] - r["cx"]) * s + 128 - l[0], (r[k + "p"][1] - r["cy"]) * s + 128 - l[1]) / l[2])
        if f in sm:
            e["smooth"].append(np.hypot(sm[f][1] - l[0], sm[f][2] - l[1]) / l[2])
        for k in ("auto", "tap"):
            if k + "p" in r and r[k + "p"][2] == "plate":
                s = 384 / r["side"]
                x, y = (r[k + "p"][0] - r["cx"]) * s + 128, (r[k + "p"][1] - r["cy"]) * s + 128
                e[k].append(np.hypot(x - l[0], y - l[1]) / l[2])
            if k + "p" in r and r[k + "p"][2] != "plate":
                s = 384 / r["side"]
                x, y = (r[k + "p"][0] - r["cx"]) * s + 128, (r[k + "p"][1] - r["cy"]) * s + 128
                e.setdefault(k + "w", []).append(np.hypot(x - l[0], y - l[1]) / l[2])
    n = len(pos)
    for k in e: tot.setdefault(k, []).extend(e[k])
    tot["n"] = tot.get("n", 0) + n
    grp = "phone" if cid.startswith("IMG") else "far"
    for k in e: tot.setdefault(grp + k, []).extend(e[k])
    tot[grp + "n"] = tot.get(grp + "n", 0) + n
    print(f"{cid[:20]:20s} n={n:2d} | model {stat(e['model'], n)} | +smooth {stat(e['smooth'], n)} | rules {stat(e['auto'], n)} | rules+tap {stat(e['tap'], n) if cid.startswith('IMG') else '  n/a'} | wrist-path frames {len(e['autow'])}: {stat(e['autow'], max(1, len(e['autow'])))[:9]} | r err {np.median(rerr) if rerr else float('nan'):.2f} | oof frames {len(oof)}, model fires on {sum(raw[f][0] >= thr for f in oof)}")
    if dump:
        os.makedirs(dump, exist_ok=True)
        tiles = []
        for f in sorted(list(pos) + oof):
            img = cv2.resize(crop(cid, f), (384, 384), interpolation=cv2.INTER_CUBIC)
            P = lambda x, y: (int(x * 1.5), int(y * 1.5))
            if f in pos:
                cv2.circle(img, P(*pos[f][:2]), int(pos[f][2] * 1.5), (0, 255, 0), 1, cv2.LINE_AA)
            r = by[f]
            if "autop" in r:
                s = 384 / r["side"]
                cv2.drawMarker(img, P((r["autop"][0] - r["cx"]) * s + 128, (r["autop"][1] - r["cy"]) * s + 128), (255, 200, 0) if r["autop"][2] == "plate" else (160, 160, 160), cv2.MARKER_TILTED_CROSS, 14, 2)
            c, x, y, rr = raw[f]
            if c >= thr:
                cv2.circle(img, P(x, y), int(rr * 1.5), (0, 0, 255), 1, cv2.LINE_AA)
                cv2.drawMarker(img, P(x, y), (0, 0, 255), cv2.MARKER_CROSS, 14, 2)
            cv2.putText(img, f"f{f} c{c:.2f}", (6, 376), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            tiles.append(img)
        while len(tiles) % 5: tiles.append(np.zeros_like(tiles[0]))
        cv2.imwrite(f"{dump}/{cid}.jpg", np.vstack([np.hstack(tiles[j:j + 5]) for j in range(0, len(tiles), 5)]), [cv2.IMWRITE_JPEG_QUALITY, 85])
for g, name in (("phone", "PHONE (6 clips)"), ("far", "OTHER (3 clips)"), ("", "ALL")):
    n = tot[g + "n"]
    print(f"{name:20s} n={n:2d} | model {stat(tot[g + 'model'], n)} | +smooth {stat(tot[g + 'smooth'], n)} | rules {stat(tot[g + 'auto'], n)} | rules+tap {stat(tot[g + 'tap'], n) if g != 'far' else '  n/a'}")
print(f"HANDS ON THE BAR only n={tot['gn']:2d} | model {stat(tot['gmodel'], tot['gn'])} | rules {stat(tot['gauto'], tot['gn'])} | rules+tap (phone clips only, of their gripped frames) {len([1 for v in tot['gtap'] if v <= 0.25])} within 0.25 r")
print("false positives on clips with no barbell (share of frames where the model says plate):")
for cid in NEG:
    m = json.load(open(f"{data}/meta/{cid}.json"))
    allf = [r["f"] for r in m["frames"]]
    raw = predict(cid, allf)
    sm = smooth(raw, allf)
    print(f"  {cid[:20]:20s} frames {len(allf)} model {100 * sum(raw[f][0] >= thr for f in allf) / len(allf):.1f}% +smooth {100 * len(sm) / len(allf):.1f}% max conf {max(raw[f][0] for f in allf):.2f}")
