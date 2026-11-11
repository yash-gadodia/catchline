"""Held-out table: a plate model against the rule tracker on hand-labelled frames.
  python evaltest.py DATA HAND.json [--weights W.pt | --preds P.json] [--thr 0.5] [--owner OWNER.json] [--far FAR.json]
                     [--dump DIR] [--name NAME]
Truth: HAND.json[id][frame] = [x, y, r, gripped] in crop px (the 256 px square the crop model sees) or "oof" (plate centre
outside the video frame). OWNER.json is the owner's labelling-page export (cx, cy as shares of width / height, r as a
share of height, or none); where it has a clip, it replaces HAND.json for that clip. FAR.json[id][frame] = [x, y] marks
the FAR plate on frames where both show, so "picked the far plate" is counted.
Model: PlateNet weights (run here on the crops) or P.json[id][frame] = [[conf, x, y, r], ...] in decoded-frame px
(any detector; best first). Rules = the point the pipeline draws when its path is read off the plate (autop; tapp = the
tap-seeded run); a wrist fallback counts as "no plate".
Columns: within 0.25 r | within 0.5 r | far plate picked | says no plate, as shares of frames with a plate; top3 = truth
within 0.25 r of one of the model's three best candidates."""
import json, os, sys
import cv2
import numpy as np


def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


data, hand_path = sys.argv[1:3]
thr = float(opt("--thr", 0.5))
dump, name = opt("--dump"), opt("--name", "model")
NEG = ["IMG_1179", "2026-09-20_A92852F6-D8FE-4EC2-B049-ED75AA6F05CC", "2026-09-22_3FB05CFF"]
hand = json.load(open(hand_path))
far = json.load(open(opt("--far"))) if opt("--far") else {}
metas = {}


def meta(cid):
    if cid not in metas:
        m = json.load(open(f"{data}/meta/{cid}.json"))
        metas[cid] = (m, {r["f"]: r for r in m["frames"]})
    return metas[cid]


def to_crop(r, x, y, rad=None):
    s = 384 / r["side"]
    out = [(x - r["cx"]) * s + 128, (y - r["cy"]) * s + 128]
    return out + [rad * s] if rad is not None else out


truth = {cid: {int(f): (dict(p=l[:3], grip=l[3]) if isinstance(l, list) else dict(p=None, oof=True)) for f, l in d.items()} for cid, d in hand.items()}
src = {cid: "mine" for cid in truth}
if opt("--owner"):
    own = {}
    for l in json.load(open(opt("--owner"))).values():
        own.setdefault(l["clip"], {})[l["frame"]] = l
    for cid, d in own.items():
        if not os.path.exists(f"{data}/meta/{cid}.json") or (opt("--owner-clips") and cid not in opt("--owner-clips").split(",")):
            continue
        m, by = meta(cid)
        t = {}
        for f, l in d.items():
            if f not in by:
                continue
            if l.get("none"):
                t[f] = dict(p=None, none=True)
            else:
                t[f] = dict(p=to_crop(by[f], l["cx"] * m["W"], l["cy"] * m["H"], l["r"] * m["H"]), grip=1)
        if t:
            truth[cid], src[cid] = t, "owner"

if opt("--weights"):
    import torch
    import torch.nn.functional as F
    from platenet import PlateNet, STRIDE, IN
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    model = PlateNet(pretrained=False).to(dev).eval()
    model.load_state_dict(torch.load(opt("--weights"), map_location=dev))

    @torch.no_grad()
    def predict(cid, frames):
        """frame -> up to 3 candidates (conf, x, y, r) in crop px, best first: local maxima of the centre heat"""
        out = {}
        for i in range(0, len(frames), 64):
            fs = frames[i:i + 64]
            x = torch.from_numpy(np.stack([cv2.imread(f"{data}/ctx/{cid}/{f:05d}.jpg")[64:320, 64:320, ::-1] for f in fs]).copy()).permute(0, 3, 1, 2).float().div(255).to(dev)
            o = model(x)
            heat = torch.sigmoid(o[:, 0])
            peak = (heat == F.max_pool2d(heat[:, None], 5, 1, 2)[:, 0]) * heat
            conf, idx = peak.flatten(1).topk(3)
            o, conf, idx = o.cpu().numpy(), conf.cpu().numpy(), idx.cpu().numpy()
            for j, f in enumerate(fs):
                c = []
                for k in range(3):
                    iy, ix = divmod(int(idx[j, k]), heat.shape[2])
                    c.append((float(conf[j, k]), (ix + 0.5 + o[j, 1, iy, ix]) * STRIDE, (iy + 0.5 + o[j, 2, iy, ix]) * STRIDE, float(np.exp(o[j, 3, iy, ix])) * IN))
                out[f] = c
        return out
else:
    P = json.load(open(opt("--preds")))

    def predict(cid, frames):
        m, by = meta(cid)
        return {f: [(c[0], *to_crop(by[f], c[1], c[2], c[3])) for c in P.get(cid, {}).get(str(f), [])[:3]] or [(0.0, 0.0, 0.0, 1.0)] for f in frames}


def stat(e, n):
    """e: list of (err in radii, far-picked) for frames that got an answer"""
    if not n:
        return "  -    -    -    - "
    a = np.array([x[0] for x in e]) if e else np.zeros(0)
    return f"{100 * (a <= 0.25).sum() / n:3.0f}% {100 * (a <= 0.5).sum() / n:3.0f}% {100 * sum(x[1] for x in e) / n:3.0f}% {100 * (n - len(e)) / n:3.0f}%"


print(f"{name}, thr {thr}. per method: <=0.25 r | <=0.5 r | far plate | no plate")
tot = {}
for cid, t in truth.items():
    m, by = meta(cid)
    frames = sorted(t)
    pred = predict(cid, frames)
    pos = {f: v for f, v in t.items() if v["p"]}
    e = {k: [] for k in ("model", "auto", "tap")}
    top3 = nonef = oof_f = 0
    for f, v in pos.items():
        l, r = v["p"], by[f]
        fp = far.get(cid, {}).get(str(f)) if src[cid] == "mine" else None
        isfar = lambda x, y: bool(fp and np.hypot(x - fp[0], y - fp[1]) < 0.6 * l[2] and np.hypot(x - l[0], y - l[1]) > 0.5 * l[2])
        c = pred[f][0]
        if c[0] >= thr:
            e["model"].append((np.hypot(c[1] - l[0], c[2] - l[1]) / l[2], isfar(c[1], c[2])))
        top3 += any(k[0] >= 0.1 and np.hypot(k[1] - l[0], k[2] - l[1]) <= 0.25 * l[2] for k in pred[f])
        for k in ("auto", "tap"):
            if k + "p" in r and r[k + "p"][2] == "plate":
                x, y = to_crop(r, r[k + "p"][0], r[k + "p"][1])
                e[k].append((np.hypot(x - l[0], y - l[1]) / l[2], isfar(x, y)))
    neg = [f for f, v in t.items() if not v["p"]]
    fires = sum(pred[f][0][0] >= thr for f in neg)
    n = len(pos)
    grp = "phone" if cid.startswith("IMG") else "other"
    for g in (grp, "all"):
        for k in e: tot.setdefault(g + k, []).extend(e[k])
        tot[g + "n"] = tot.get(g + "n", 0) + n
        tot[g + "top3"] = tot.get(g + "top3", 0) + top3
        tot[g + "both"] = tot.get(g + "both", 0) + (sum(str(f) in far.get(cid, {}) for f in pos) if src[cid] == "mine" else 0)
    print(f"{cid[:19]:19s} {src[cid]:5s} n={n:2d} | {name} {stat(e['model'], n)} top3 {100 * top3 / max(1, n):3.0f}% | rules {stat(e['auto'], n)} | rules+tap {stat(e['tap'], n) if grp == 'phone' else '  n/a'} | no-plate/out-of-frame frames {len(neg)}, {name} fires on {fires}")
    if dump:
        os.makedirs(dump, exist_ok=True)
        tiles = []
        for f in frames:
            img = cv2.resize(cv2.imread(f"{data}/ctx/{cid}/{f:05d}.jpg")[64:320, 64:320], (384, 384), interpolation=cv2.INTER_CUBIC)
            Q = lambda x, y: (int(x * 1.5), int(y * 1.5))
            if t[f]["p"]:
                cv2.circle(img, Q(*t[f]["p"][:2]), int(t[f]["p"][2] * 1.5), (0, 255, 0), 1, cv2.LINE_AA)
            if str(f) in far.get(cid, {}) and src[cid] == "mine":
                cv2.drawMarker(img, Q(*far[cid][str(f)]), (0, 255, 0), cv2.MARKER_DIAMOND, 10, 1)
            r = by[f]
            if "autop" in r:
                cv2.drawMarker(img, Q(*to_crop(r, r["autop"][0], r["autop"][1])), (255, 200, 0) if r["autop"][2] == "plate" else (160, 160, 160), cv2.MARKER_TILTED_CROSS, 14, 2)
            for k, c in enumerate(pred[f]):
                if (k == 0 and c[0] >= thr) or (k > 0 and c[0] >= 0.1):
                    col = (0, 0, 255) if k == 0 else (0, 140, 255)
                    cv2.circle(img, Q(c[1], c[2]), int(c[3] * 1.5), col, 1, cv2.LINE_AA)
                    cv2.drawMarker(img, Q(c[1], c[2]), col, cv2.MARKER_CROSS, 14 if k == 0 else 8, 2 if k == 0 else 1)
            cv2.putText(img, f"f{f} c{pred[f][0][0]:.2f}", (6, 376), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            tiles.append(img)
        while len(tiles) % 5: tiles.append(np.zeros_like(tiles[0]))
        cv2.imwrite(f"{dump}/{cid}.jpg", np.vstack([np.hstack(tiles[j:j + 5]) for j in range(0, len(tiles), 5)]), [cv2.IMWRITE_JPEG_QUALITY, 85])
for g, label in (("phone", "PHONE clips"), ("other", "OTHER clips"), ("all", "ALL")):
    n = tot.get(g + "n", 0)
    if n:
        print(f"{label:25s} n={n:3d} (both plates marked on {tot[g + 'both']}) | {name} {stat(tot[g + 'model'], n)} top3 {100 * tot[g + 'top3'] / n:3.0f}% | rules {stat(tot[g + 'auto'], n)} | rules+tap {stat(tot[g + 'tap'], n) if g == 'phone' else '  n/a'}")
print("false positives on clips with no barbell (share of scored frames where the model says plate):")
for cid in NEG:
    m, by = meta(cid)
    frames = [r["f"] for r in m["frames"]][::3]
    pred = predict(cid, frames)
    print(f"  {cid[:20]:20s} frames {len(frames)} {name} {100 * sum(pred[f][0][0] >= thr for f in frames) / len(frames):.1f}% max conf {max(pred[f][0][0] for f in frames):.2f}")
