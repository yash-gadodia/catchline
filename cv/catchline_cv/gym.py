"""Gymnastics (23-gymnastics.md): kipping pull-up, bar muscle-up, kipping HSPU. Pure signal functions; heights up
positive, x in the lifter's forward direction, any consistent unit. Frames index the arrays passed in."""
import numpy as np
from scipy.signal import find_peaks

from .pose import L_SHO, R_SHO

KIP_PHASES = ["arch", "hollow", "hip_drive", "recovery"]
BMU_PHASES = ["arch", "hollow", "hip_drive", "transition", "support", "lockout"]
HSPU_PHASES = ["tuck", "drive", "press", "lockout"]


def cycle_tops(h, scale, fps, prominence=0.4, min_gap_s=0.6):
    """Rep tops of a cyclic height signal: peaks at least `prominence` x scale above both neighbouring valleys.
    Returns [(start, top, end)] with start/end the valleys either side (clip ends when there is none)."""
    h = np.asarray(h, float)
    tops, _ = find_peaks(h, prominence=prominence * scale, distance=max(1, int(min_gap_s * fps)))
    out = []
    for i, t in enumerate(tops):
        lo = tops[i - 1] if i else 0
        hi = tops[i + 1] if i + 1 < len(tops) else len(h) - 1
        a = lo + int(np.argmin(h[lo:t + 1]))
        b = t + int(np.argmin(h[t:hi + 1]))
        out.append((int(a), int(t), int(b)))
    return out


def shoulders_cut_off(k, a, b, height, edge=0.03):
    """True when the pose put a shoulder at the top edge of the frame (within `edge` of the frame height) in frames
    a..b: the head and the bar above it are out of shot, so every height measured against the bar is a guess."""
    return bool(np.nanmin(k[a:b + 1, [L_SHO, R_SHO], 1]) < edge * height)


def merge_cycles(cycles, h, rel, hang_level):
    """Merge neighbouring reps whose valley never gets back down to the hang (rel above hang_level): the later, higher
    top is the rep's top. cycles from cycle_tops; rel = shoulders above the hands per frame."""
    out = []
    for c in cycles:
        if out and rel[out[-1][2]] > hang_level and c[0] <= out[-1][2] + 1:
            a = out[-1][0]
            t = c[1] if h[c[1]] >= h[out[-1][1]] else out[-1][1]
            out[-1] = (a, t, c[2])
        else:
            out.append(c)
    return out


def sustained_below(x, thr, start, stop):
    """First frame in [start, stop] from which x stays below thr up to stop, or None."""
    x = np.asarray(x, float)
    for f in range(start, stop + 1):
        if np.all(x[f:stop + 1] < thr):
            return f
    return None


def kip_events(legs_fwd, hip_ang, elbow, a, t):
    """Kip swing events in a rep [a, top t]. legs_fwd: knee ahead of hip (+ = legs in front, the hollow; - = the arch).
    hip_open = fastest hip opening after the hollow's tightest hip angle; elbow_break = the arms start bending for good."""
    legs_fwd, hip_ang, elbow = (np.asarray(x, float) for x in (legs_fwd, hip_ang, elbow))
    hollow_start = None
    for f in range(t, a, -1):
        if legs_fwd[f] > 0 and legs_fwd[f - 1] <= 0:
            hollow_start = f
            break
    if hollow_start is None:
        hollow_start = a
    arch_start = hollow_start
    while arch_start > a and legs_fwd[arch_start - 1] <= 0:
        arch_start -= 1
    tight = hollow_start + int(np.argmin(hip_ang[hollow_start:t + 1]))
    v = np.gradient(hip_ang)
    hip_open = tight + int(np.argmax(v[tight:t + 1])) if t > tight else tight
    brk = sustained_below(elbow, 160.0, arch_start, t)
    return {"arch_start": arch_start, "hollow_start": hollow_start, "hip_tight": tight, "hip_open": hip_open,
            "elbow_break": brk if brk is not None else t, "top": t}


def push_away(sho_x_fwd, t, fps, window_s=0.4):
    """How far the shoulders move back, away from the bar, in the window after the top (positive = pushed away)."""
    x = np.asarray(sho_x_fwd, float)
    w = x[t: min(len(x), t + int(window_s * fps) + 1)]
    return float(np.max(x[t] - w)) if len(w) else 0.0


def kip_phases(ev, end):
    b = [ev["arch_start"], ev["hollow_start"], ev["hip_open"], ev["top"], end]
    for i in range(1, len(b)):
        b[i] = max(b[i], b[i - 1] + 1)
    spans = [(b[0], b[1] - 1), (b[1], b[2] - 1), (b[2], b[3]), (b[3] + 1, b[4])]
    return [{"name": n, "startFrame": int(s), "endFrame": int(max(s, e))} for n, (s, e) in zip(KIP_PHASES, spans)]


def bmu_events(kip, elbow_h_l, elbow_h_r, sho_h, elbow, bar_h, scale, end):
    """Bar muscle-up events after the kip: the first elbow over the bar line (transition), shoulders above the bar
    (support), arms straight on top (lockout). Heights relative to anything consistent with bar_h."""
    t0 = kip["hip_open"]
    el = np.fmax(np.asarray(elbow_h_l, float), np.asarray(elbow_h_r, float))
    over = np.where(el[t0:end + 1] > bar_h)[0]
    cross = t0 + int(over[0]) if len(over) else None
    start = cross if cross is not None else t0
    sup = np.where(np.asarray(sho_h)[start:end + 1] > bar_h + 0.1 * scale)[0]
    support = start + int(sup[0]) if len(sup) else None
    lock = None
    if support is not None:
        lk = np.where(np.asarray(elbow)[support:end + 1] >= 160)[0]
        lock = support + int(lk[0]) if len(lk) else None
    return {**kip, "cross": cross, "support": support, "lockout": lock}


def bmu_phases(ev, end):
    marks = [ev["arch_start"], ev["hollow_start"], ev["hip_open"]]
    names = ["arch", "hollow", "hip_drive"]
    for n, key in (("transition", "cross"), ("support", "support"), ("lockout", "lockout")):
        if ev.get(key) is not None:
            marks.append(ev[key])
            names.append(n)
    marks.append(end)
    for i in range(1, len(marks)):
        marks[i] = max(marks[i], marks[i - 1] + 1)
    return [{"name": n, "startFrame": int(marks[i]), "endFrame": int(max(marks[i], marks[i + 1] - (i + 1 < len(names))))}
            for i, n in enumerate(names)]


def hspu_events(sho_h, hip_ang, knee, elbow, top0, top1, fps):
    """One kipping HSPU between two lockouts (shoulder-height peaks top0 and top1): bottom (shoulders lowest,
    head on the floor), tuck (tightest hip), drive (fastest knee extension), press (fastest elbow extension),
    lockout (arms straight again)."""
    sho_h, hip_ang, knee, elbow = (np.asarray(x, float) for x in (sho_h, hip_ang, knee, elbow))
    bottom = top0 + int(np.argmin(sho_h[top0:top1 + 1]))
    tuck = top0 + int(np.argmin(hip_ang[top0:top1 + 1]))
    s = min(tuck, bottom)
    kv, ev = np.gradient(knee), np.gradient(elbow)
    drive = s + int(np.argmax(kv[s:top1 + 1]))
    press = bottom + int(np.argmax(ev[bottom:top1 + 1]))
    lk = np.where(elbow[press:top1 + 1] >= 160)[0]
    lockout = press + int(lk[0]) if len(lk) else top1
    return {"top0": top0, "bottom": bottom, "tuck": tuck, "drive": drive, "press": press, "lockout": lockout, "top1": top1}


def hspu_phases(ev):
    b = [ev["top0"], ev["drive"], ev["press"], ev["lockout"], ev["top1"]]
    for i in range(1, len(b)):
        b[i] = max(b[i], b[i - 1] + 1)
    spans = [(b[0], b[1] - 1), (b[1], b[2] - 1), (b[2], b[3] - 1), (b[3], b[4])]
    return [{"name": n, "startFrame": int(s), "endFrame": int(max(s, e))} for n, (s, e) in zip(HSPU_PHASES, spans)]


def timing_error(drive, press, fps, window_s=0.25):
    """Kip HSPU timing: the press should start with or just after the leg drive. Seconds outside [0, window_s] of
    press - drive (pressing before the kick, or after it has faded); 0 inside the window."""
    lag = (press - drive) / fps
    return float(max(0.0, -lag, lag - window_s))


def chord_offset(sho, hip, ank, away):
    """Signed distance of the hip from the shoulder-ankle chord (2D points); positive toward `away` (unit x sign)."""
    sho, hip, ank = (np.asarray(p, float) for p in (sho, hip, ank))
    d = ank - sho
    L = np.linalg.norm(d)
    if not L:
        return 0.0
    n = np.array([-d[1], d[0]]) / L
    off = float(np.dot(hip - sho, n))
    return off if np.sign(n[0]) == np.sign(away) or n[0] == 0 else -off
