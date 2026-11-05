"""Prototype: the bar path from the centre of the near plate (sleeve end, side-on) instead of the wrist midpoint, plus
the coaching overlay from the reference reel (start line, knee / hip / peak lines, a ring at the cue moment).

Not used by the app or the worker. Reads a clip, its pose cache and the analysis JSON the pipeline wrote for it,
and writes into --out: tracks.json (per-frame tracks + stats), compare.mp4 (1080x1920, left = today's wrist path,
right = plate path + reference lines) and sheet.png.

    uv run --with pillow python scripts/plate_path_proto.py CLIP ANALYSIS.json --cache DIR --out DIR
"""
import argparse
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from catchline_cv.geometry import bar_from_wrists, fill_nans, lowpass  # noqa: E402
from catchline_cv.lifter import select_lifter  # noqa: E402
from catchline_cv.pipeline import PLATE_CM, load_pose, mid  # noqa: E402
from catchline_cv.pose import (L_ANK, L_BIGTOE, L_HEEL, L_HIP, L_KNEE, L_WRI, R_ANK, R_BIGTOE, R_HEEL, R_HIP,  # noqa: E402
                               R_KNEE, R_WRI)
from catchline_cv.track import (ellipse_search, find_plates, foreground_mask, from_ref, plate_mask,  # noqa: E402
                                refine_centre, refine_plate, stabilise, to_ref, track_plate)
from catchline_cv.video import frames, probe  # noqa: E402

FLARE = (255, 31, 61)
BLUE = (64, 156, 255)
WHITE = (255, 255, 255)
PANEL_W, PANEL_H = 540, 960
FONT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "node_modules", "@expo-google-fonts",
                        "big-shoulders-display")
SHORT_GAP_S = 0.2


def font(size, weight="800ExtraBold"):
    return ImageFont.truetype(os.path.join(FONT_DIR, f"BigShouldersDisplay_{weight}.ttf"), size)


def phase_at(phases, f):
    return next((p["name"] for p in phases if p["startFrame"] <= f <= p["endFrame"]), "after")


def hough_plates(img, centre, half, r_lo, r_hi, perfect=0.45):
    """Circles (x, y, r) whose rim is a strong edge, in a box around centre. Contrast-equalised first: a dark plate on
    a dark floor fails any brightness threshold but keeps its rim."""
    H, W = img.shape[:2]
    x0, y0 = int(max(0, centre[0] - half)), int(max(0, centre[1] - half))
    x1, y1 = int(min(W, centre[0] + half)), int(min(H, centre[1] + half))
    if x1 - x0 < 2 * r_lo or y1 - y0 < 2 * r_lo:
        return []
    g = cv2.createCLAHE(3.0, (8, 8)).apply(cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY))
    c = cv2.HoughCircles(cv2.GaussianBlur(g, (0, 0), 2), cv2.HOUGH_GRADIENT_ALT, 1.5, r_lo, param1=60, param2=perfect,
                         minRadius=int(r_lo), maxRadius=int(r_hi))
    return [] if c is None else [np.array([x + x0, y + y0, r]) for x, y, r in c[0]]


def rim_support(img, plate):
    """Share of the fitted outline that sits on a strong edge running along it: a dark floor or wall region that
    scores as a filled disc has no rim where the fit draws one."""
    g = cv2.createCLAHE(3.0, (8, 8)).apply(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)).astype(np.float32)
    g = cv2.GaussianBlur(g, (0, 0), 2)
    gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)
    thr = np.percentile(np.hypot(gx, gy), 80)
    t = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    b, a = plate["axes"][0] / 2, plate["axes"][1] / 2
    n = np.stack([np.cos(t) / a, np.sin(t) / b], 1)
    n /= np.linalg.norm(n, axis=1, keepdims=True)
    hits = []
    for r in (0.94, 1.0, 1.06):
        x = np.round(plate["centre"][0] + r * a * np.cos(t)).astype(int)
        y = np.round(plate["centre"][1] + r * b * np.sin(t)).astype(int)
        ok = (x >= 0) & (x < g.shape[1]) & (y >= 0) & (y < g.shape[0])
        radial = np.zeros(len(t))
        radial[ok] = np.abs(gx[y[ok], x[ok]] * n[ok, 0] + gy[y[ok], x[ok]] * n[ok, 1])
        hits.append(radial > thr)
    return float(np.any(hits, axis=0).mean())


def seed_hough(img, wrist, setup_h):
    """The near plate at setup: the largest rim circle sized like a plate next to the hands."""
    cs = [q for q in hough_plates(img, np.array(img.shape[1::-1]) / 2, max(img.shape), 0.15 * setup_h, 0.4 * setup_h)
          if abs(q[0] - wrist[0]) < 0.5 * setup_h and -0.15 * setup_h < q[1] - wrist[1] < 0.35 * setup_h]
    if not cs:
        return None
    x, y, r = max(cs, key=lambda q: q[2])
    return {"centre": np.array([x, y]), "axes": (2 * r, 2 * r), "score": 1.0, "side": "near"}


def seed_plate(img, wrist, floor_y, setup_h):
    """The near plate at setup from physics, not the largest dark blob: a disc 30-75% of the crouched lifter's height,
    standing on the floor at the feet, under the hands. find_plates' 'largest close fit' takes a dark floor or wall
    for the plate in dim gyms."""
    m = plate_mask(img)
    best = None
    for D in np.linspace(0.3, 0.75, 19) * setup_h:
        cands = [[wrist[0] + dx, floor_y - D / 2 + dy] for dx in np.linspace(-0.3, 0.3, 31) * setup_h
                 for dy in np.linspace(-0.08, 0.3, 20) * setup_h]
        p = ellipse_search(m, cands, [D], np.linspace(0.6, 1.0, 5))
        if p and (best is None or p["score"] > best["score"]):
            best = p
    if best is None or best["score"] < 0.5:
        return None
    q = refine_plate(img, best)
    return q if q and np.linalg.norm(q["centre"] - best["centre"]) < 0.12 * best["axes"][0] else best


def baseline_track(fr, seed, plate):
    """Today's tracker (cv track_plate, which the Swift Plates stage ports): stops at the first lost frame."""
    c, _ = track_plate(fr, seed, plate)
    return c


def robust_track(fr, seed, plate, wrist):
    """Re-detect the plate near two predictions (constant velocity, and the wrist plus the last plate-to-wrist offset:
    the bar is in the hands), refit the ellipse to the outline, and carry the centre with KLT on the plate's
    hub/lettering when detection fails. Never stops: a lost frame is re-acquired later. Off side-on the near plate is
    closer to the camera than the bar centre, so it travels and grows more than the wrists: the size follows the
    refits, and re-acquiring searches a plate width around the wrist anchor, on the same side of the hands as at
    setup (the far plate is on the other). src 1 = ellipse, 2 = KLT."""
    n = len(fr)
    M, m0 = plate["axes"]
    ratio = m0 / M
    cen, src = np.full((n, 2), np.nan), np.zeros(n, int)
    c, v = np.asarray(plate["centre"], float), np.zeros(2)
    off = c - wrist[seed]
    side = np.sign(off[0]) if abs(off[0]) > 0.5 * M else 0
    cen[seed], src[seed] = c, 1
    prev = cv2.cvtColor(fr[seed], cv2.COLOR_BGR2GRAY)
    pts = disc_features(prev, c, M)
    for f in range(seed + 1, n):
        gray = cv2.cvtColor(fr[f], cv2.COLOR_BGR2GRAY)
        m = plate_mask(fr[f])
        lost = src[f - 1] == 0
        anchor = wrist[f] + off
        has_anchor = np.isfinite(anchor).all()
        g = np.linspace(-1.0, 1.0, 21) * M if lost else np.linspace(-0.4, 0.4, 17) * M
        preds = [c + v] + ([anchor] if has_anchor else [])
        cands = [p + [dx, dy] for p in preds for dx in g for dy in g]
        det, det_score = None, 0.0
        gate = (1.2 if lost else 0.6) * M
        same_side = lambda x: not side or not np.isfinite(wrist[f]).all() or np.sign(x - wrist[f, 0]) == side
        in_gate = lambda q: (not has_anchor or np.linalg.norm(q - anchor) < gate or np.linalg.norm(q - (c + v)) < 0.3 * M) \
            and same_side(q[0])
        circ = [q for q in hough_plates(fr[f], c + v if not lost else (anchor if has_anchor else c), (1.6 if lost else 0.9) * M,
                                        0.4 * M, 0.6 * M, 0.4) if in_gate(q[:2])]
        if circ:
            q = min(circ, key=lambda q: np.linalg.norm(q[:2] - (c + v)))
            det, det_score = q[:2], 0.7
            M = 0.8 * M + 0.2 * 2 * q[2]
        else:
            p = ellipse_search(m, cands, M * np.array([0.85, 1.0, 1.15]), [ratio * k for k in (0.85, 1.0, 1.15)])
            if p and p["score"] >= 0.6 and in_gate(p["centre"]):
                q = refine_plate(fr[f], p)
                det = q["centre"] if q and np.linalg.norm(q["centre"] - p["centre"]) < 0.12 * M else refine_centre(m, p)
                det_score = p["score"]
        klt = None
        if pts is not None and len(pts) >= 6 and not lost:
            p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, gray, pts, None, winSize=(21, 21), maxLevel=3)
            p0b, st2, _ = cv2.calcOpticalFlowPyrLK(gray, prev, p1, None, winSize=(21, 21), maxLevel=3)
            ok = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm((p0b - pts).reshape(-1, 2), axis=1) < 1.0)
            if ok.sum() >= 6:
                klt = c + np.median((p1 - pts).reshape(-1, 2)[ok], axis=0)
                pts = p1[ok]
            else:
                pts = None
        if det is not None and (klt is None or det_score >= 0.6 or np.linalg.norm(det - klt) < 0.15 * M):
            new, src[f] = det, 1
        elif klt is not None:
            new, src[f] = klt, 2
        else:
            c, v = c + v, 0.8 * v
            prev = gray
            continue
        v = np.zeros(2) if lost else new - c
        c = new
        cen[f] = c
        if src[f] == 1:
            off = c - wrist[f] if np.isfinite(wrist[f]).all() else off
            pts = disc_features(gray, c, M)
        prev = gray
    return cen, src


def disc_features(gray, c, M):
    mask = np.zeros_like(gray)
    cv2.circle(mask, (int(c[0]), int(c[1])), int(0.42 * M), 255, -1)
    return cv2.goodFeaturesToTrack(gray, 60, 0.01, 4, mask=mask)


def fuse(cen, src, wrist, fps):
    """Plate where tracked; elsewhere the wrist path shifted by the plate-to-wrist offset interpolated across the gap,
    so the line has no seam. Gaps up to SHORT_GAP_S count as interpolated, longer ones as wrist fallback."""
    ok = src > 0
    idx = np.flatnonzero(ok)
    off = cen - wrist
    fill = np.stack([np.interp(np.arange(len(cen)), idx, off[idx, j]) for j in range(2)], axis=1)
    fused = np.where(ok[:, None], cen, wrist + fill)
    kind = np.where(ok, "plate", "wrist")
    gap_start = None
    for f in range(len(ok) + 1):
        if f < len(ok) and not ok[f]:
            gap_start = f if gap_start is None else gap_start
        elif gap_start is not None:
            inner = gap_start > idx[0] and f < len(ok)
            if inner and (f - gap_start) / fps <= SHORT_GAP_S:
                kind[gap_start:f] = "interp"
            gap_start = None
    return lowpass(fused, fps, 6.0), kind


def analyse(clip, analysis, cache):
    meta = probe(clip)
    fps = meta["fps"]
    people, shape = load_pose(clip, cache)
    H = shape[0]
    k, _, boxes = select_lifter(people)
    rep = analysis["reps"][analysis["bestRepIndex"] - 1]
    phases = rep["phases"]
    ph = {p["name"]: p for p in phases}
    s0, e0 = rep["startFrame"], rep["endFrame"] + 1
    fr = [im for _, im in frames(clip, H, s0, e0 - s0, fps)]
    e0 = s0 + len(fr)
    kw = k[s0:e0]
    body_h = float(np.nanmedian(boxes[s0:e0, 3] - boxes[s0:e0, 1]))
    lo = ph["first_pull"]["startFrame"] - s0
    seed = max(0, lo - 3)
    setup_h = float(np.nanmedian(boxes[s0 + max(0, lo - 24): s0 + lo + 1, 3] - boxes[s0 + max(0, lo - 24): s0 + lo + 1, 1]))

    wrist = np.stack([fill_nans(c) for c in bar_from_wrists(kw[:, L_WRI], kw[:, R_WRI], 0.12 * body_h).T], axis=1)
    feet = kw[max(0, seed - 5):seed + 1][:, [L_ANK, R_ANK, L_HEEL, R_HEEL, L_BIGTOE, R_BIGTOE], 1]
    today = [refine_plate(fr[seed], p) or p for p in find_plates(fr[seed], kw[seed, L_WRI], kw[seed, R_WRI], body_h, setup_h)]
    # the near plate is the larger disc; a fit outside 30-80% of the crouched lifter is a floor or a wall, not a plate
    seeds = [q for q in (seed_hough(fr[seed], wrist[seed], setup_h), today[0] if today else None,
                         seed_plate(fr[seed], wrist[seed], float(np.nanmax(np.nanmedian(feet, axis=0))), setup_h))
             if q is not None and 0.3 <= q["axes"][0] / setup_h <= 0.8
             and abs(q["centre"][0] - wrist[seed][0]) < 0.6 * setup_h and abs(q["centre"][1] - wrist[seed][1]) < 0.5 * setup_h]
    support = [rim_support(fr[seed], q) for q in seeds]
    near = dict(seeds[int(np.argmax(support))]) if seeds else None
    if near is None:
        raise SystemExit(f"no plate at setup in {clip}")
    near["axes"] = (float(near["axes"][0]), float(near["axes"][1]))
    D = float(near["axes"][0])
    today_ok = bool(today) and bool(np.linalg.norm(today[0]["centre"] - near["centre"]) < 0.25 * D \
        and abs(today[0]["axes"][0] / D - 1) < 0.25)

    before = baseline_track(fr, seed, near)
    cen, src = robust_track(fr, seed, near, wrist)
    fused, kind = fuse(cen, src, wrist, fps)
    wrist_s = lowpass(wrist, fps, 6.0)

    win = np.arange(seed, len(fr))
    pct = lambda mask: round(100 * float(mask[win].mean()), 1)
    b_ok = np.isfinite(before).all(1)
    first_lost = next((f for f in win if not b_ok[f]), None)
    lost_after = {}
    for f in win[src[win] == 0]:
        name = phase_at(phases, f + s0)
        lost_after[name] = lost_after.get(name, 0) + 1
    both = win[src[win] > 0]
    gap_px = np.linalg.norm(cen[both] - wrist_s[both], axis=1)
    px_per_cm = D / PLATE_CM

    # reference lines, all in the window's first-frame pixels so a moving camera keeps them on the floor
    masks = [foreground_mask(im.shape, [p[0] for p in people[s0 + i]], kw[i, [L_WRI, R_WRI]], 0.12 * body_h)
             for i, im in enumerate(fr)]
    Ms, _ = stabilise(fr, masks)
    fused_r, wrist_r = to_ref(fused, Ms), to_ref(wrist_s, Ms)
    knee_r = to_ref(mid(kw, L_KNEE, R_KNEE), Ms)
    hip_r = to_ref(mid(kw, L_HIP, R_HIP), Ms)
    f_knee = ph["first_pull"]["endFrame"] - s0
    f_hip = ph["second_pull"]["startFrame"] - s0
    f_catch_end = ph["catch"]["endFrame"] - s0
    peak = int(f_hip + np.argmin(fused_r[f_hip:f_catch_end + 1, 1]))
    fwd = float(np.sign(np.nanmedian(mid(kw, L_BIGTOE, R_BIGTOE)[:, 0] - mid(kw, L_HEEL, R_HEEL)[:, 0])) or 1.0)
    ev = (analysis.get("cue") or {}).get("evidence") or {}
    if ev.get("rep") == rep["index"] and s0 <= ev.get("frame", -1) < e0:
        ring, ring_why = ev["frame"] - s0, "CUE"
    else:
        f_turn = ph["turnover"]["startFrame"] - s0
        drift = (fused_r[lo:f_turn + 1, 0] - fused_r[seed, 0]) * fwd
        ring, ring_why = int(lo + np.argmax(drift)), "MAX DRIFT"

    stats = {
        "clip": os.path.basename(clip), "fps": fps, "rep": rep["index"], "window": [int(seed + s0), int(e0 - 1)],
        "plate_px": round(D, 1), "today_seed_ok": today_ok, "seed_rim": round(max(support), 2),
        "before_pct": pct(b_ok),
        "before_lost_at": None if first_lost is None else {"frame": int(first_lost + s0), "phase": phase_at(phases, first_lost + s0)},
        "after_pct": pct(src > 0), "after_ellipse_pct": pct(src == 1), "after_klt_pct": pct(src == 2),
        "after_interp_pct": pct(kind == "interp"), "after_wrist_fallback_pct": pct(kind == "wrist"),
        "after_lost_by_phase": lost_after,
        "plate_vs_wrist_mean_px": round(float(gap_px.mean()), 1),
        "plate_vs_wrist_mean_cm": round(float(gap_px.mean() / px_per_cm), 1),
        "plate_vs_wrist_mean_dx_cm": round(float(np.mean((cen[both, 0] - wrist_s[both, 0]) * fwd) / px_per_cm), 1),
        "ring": {"frame": int(ring + s0), "why": ring_why}, "peak_frame": int(peak + s0),
    }
    geo = {"fr": fr, "Ms": Ms, "seed": seed, "fused_r": fused_r, "wrist_r": wrist_r, "kind": kind,
           "start_x": float(fused_r[seed, 0]), "knee_y": float(knee_r[f_knee, 1]), "hip_y": float(hip_r[f_hip, 1]),
           "peak_y": float(fused_r[peak, 1]), "ring": ring, "ring_why": ring_why, "D": D, "fps": fps,
           "phases": phases, "s0": s0}
    tracks = {"frame": list(range(s0, e0)), "before": before.round(1).tolist(), "plate": cen.round(1).tolist(),
              "src": src.tolist(), "wrist": wrist_s.round(1).tolist(), "fused": fused.round(1).tolist(),
              "kind": kind.tolist()}
    return stats, geo, tracks


def crop_box(geo):
    """A 9:16 crop around the bar path (the whole frame if it is already portrait)."""
    h, w = geo["fr"][0].shape[:2]
    cw = min(w, int(round(h * PANEL_W / PANEL_H)))
    xs = geo["fused_r"][geo["seed"]:, 0]
    cx = float(np.nanmedian(xs))
    x0 = int(np.clip(cx - cw / 2, 0, w - cw))
    return x0, cw, h


def draw_panel(img, geo, f, crop, which):
    x0, cw, h = crop
    s = PANEL_H / h
    M = geo["Ms"][f]
    P = lambda p: ((from_ref(p, M)[0] - x0) * s, from_ref(p, M)[1] * s)
    panel = Image.fromarray(cv2.cvtColor(img[:, x0:x0 + cw], cv2.COLOR_BGR2RGB)).resize((PANEL_W, PANEL_H), Image.BILINEAR)
    lay = Image.new("RGBA", panel.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    lab = font(26)
    seed = geo["seed"]
    if which == "plate":
        a = int(255 * 0.6)
        top, bot = P((geo["start_x"], -1e4)), P((geo["start_x"], 1e4))
        d.line([top, bot], fill=BLUE + (a,), width=2)
        for name, y in (("KNEE", geo["knee_y"]), ("HIP", geo["hip_y"]), ("PEAK", geo["peak_y"])):
            if not np.isfinite(y):
                continue
            l, r = P((-1e4, y)), P((1e4, y))
            d.line([l, r], fill=WHITE + (a,), width=2)
            d.text((12, (l[1] + r[1]) / 2 - 30), name, font=lab, fill=WHITE + (int(255 * 0.8),))
    path = geo["fused_r"] if which == "plate" else geo["wrist_r"]
    pts = [P(p) for p in path[seed:f + 1] if np.isfinite(p).all()]
    if len(pts) > 1:
        d.line(pts, fill=FLARE + (255,), width=5, joint="curve")
    if pts:
        x, y = pts[-1]
        d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=FLARE + (255,))
    if which == "plate" and geo["ring"] <= f <= geo["ring"] + int(1.2 * geo["fps"]):
        x, y = P(geo["fused_r"][geo["ring"]])
        r = 0.62 * geo["D"] * s
        d.ellipse([x - r, y - r, x + r, y + r], outline=WHITE + (235,), width=4)
        d.text((x + r + 6, y - 16), geo["ring_why"], font=lab, fill=WHITE + (235,))
    d.rectangle([0, 0, PANEL_W, 84], fill=(0, 0, 0, 150))
    d.text((18, 10), "TODAY" if which == "wrist" else "PROTOTYPE", font=font(38), fill=WHITE + (255,))
    d.text((18, 50), "BAR = WRIST MIDPOINT" if which == "wrist" else "BAR = PLATE CENTRE", font=font(24, "500Medium"),
           fill=WHITE + (200,))
    return Image.alpha_composite(panel.convert("RGBA"), lay).convert("RGB")


def compose(geo, f, crop):
    out = Image.new("RGB", (2 * PANEL_W, PANEL_H * 2), (0, 0, 0))
    out.paste(draw_panel(geo["fr"][f], geo, f, crop, "wrist"), (0, PANEL_H // 2))
    out.paste(draw_panel(geo["fr"][f], geo, f, crop, "plate"), (PANEL_W, PANEL_H // 2))
    d = ImageDraw.Draw(out)
    d.text((24, PANEL_H // 2 - 70), phase_at(geo["phases"], f + geo["s0"]).replace("_", " ").upper(), font=font(48),
           fill=WHITE)
    d.rectangle([PANEL_W - 1, PANEL_H // 2, PANEL_W, PANEL_H // 2 + PANEL_H], fill=(0, 0, 0))
    return out


def render(geo, out_dir):
    crop = crop_box(geo)
    fps = geo["fps"]
    path = os.path.join(out_dir, "compare.mp4")
    ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "1080x1920",
                           "-r", f"{fps}", "-i", "-", "-vf", "setpts=2*PTS", "-r", f"{fps}", "-c:v", "libx264",
                           "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", path], stdin=subprocess.PIPE)
    hold = int(round(fps * 0.6))
    for f in range(geo["seed"], len(geo["fr"])):
        im = compose(geo, f, crop).tobytes()
        for _ in range(1 + (hold if f == geo["ring"] else 0)):
            ff.stdin.write(im)
    ff.stdin.close()
    ff.wait()
    ph = {p["name"]: p["endFrame"] - geo["s0"] for p in geo["phases"]}
    picks = sorted({geo["seed"], ph["first_pull"], ph["transition"], geo["ring"], ph["second_pull"], ph["turnover"],
                    min(ph["catch"], len(geo["fr"]) - 1)})
    tiles = [compose(geo, f, crop).resize((360, 640)) for f in picks]
    sheet = Image.new("RGB", (360 * len(tiles), 640))
    for i, t in enumerate(tiles):
        sheet.paste(t, (360 * i, 0))
    sheet.save(os.path.join(out_dir, "sheet.png"))
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("analysis")
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-video", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    stats, geo, tracks = analyse(a.clip, json.load(open(a.analysis)), a.cache)
    json.dump({"stats": stats, "tracks": tracks}, open(os.path.join(a.out, "tracks.json"), "w"))
    if not a.no_video:
        stats["video"] = render(geo, a.out)
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
