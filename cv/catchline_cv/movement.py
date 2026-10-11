"""Check the movement the app says the clip shows against what the lifter's body does, before analysing it.
Pure functions over the tracked lifter's keypoints (image px, y down)."""
import numpy as np

from .geometry import lowpass
from .pose import L_ANK, L_HIP, L_KNEE, L_SHO, L_WRI, R_ANK, R_HIP, R_KNEE, R_SHO, R_WRI

FAMILY = {"snatch": "barbell", "clean": "barbell", "jerk": "barbell",
          "kipping_pull_up": "hanging", "bar_muscle_up": "hanging", "kipping_hspu": "inverted"}
NAMES = {"snatch": "snatch", "clean": "clean", "jerk": "jerk", "kipping_pull_up": "kipping pull-up",
         "bar_muscle_up": "bar muscle-up", "kipping_hspu": "kipping handstand push-up",
         "barbell": "a barbell lift", "hanging": "a bar movement (hanging)", "inverted": "a handstand movement"}


def mid(k, a, b):
    return (k[:, a] + k[:, b]) / 2


def torso_px(k):
    return float(np.nanmedian(np.linalg.norm(mid(k, L_SHO, R_SHO) - mid(k, L_HIP, R_HIP), axis=1)))


def head_y(k, torso=None):
    """A body-derived stand-in for the nose height (no head keypoints are kept): 0.2 torso beyond the shoulders along
    the hip->shoulder line, so it also works upside down. On 7 clips with nose points the nose sat 0.10-0.30 torso
    above the shoulders with the arms overhead (median of medians 0.26)."""
    torso = torso or torso_px(k)
    sho, hip = mid(k, L_SHO, R_SHO), mid(k, L_HIP, R_HIP)
    d = sho - hip
    n = np.linalg.norm(d, axis=1, keepdims=True)
    return (sho + 0.2 * torso * d / np.where(n > 0, n, np.nan))[:, 1]


def signals(k, fps):
    """Per-clip body signals used to tell movement families apart. k: the lifter's keypoints with camera motion
    removed (a fixed bar must stay put). Durations in seconds, ranges in torso lengths."""
    ok = np.isfinite(k[:, [L_SHO, R_SHO, L_HIP, R_HIP]]).all(axis=(1, 2))
    if ok.sum() < fps:
        return None
    k = k[ok]
    t = torso_px(k)
    up = lambda y: -lowpass(y, fps)
    sho, hip = up(mid(k, L_SHO, R_SHO)[:, 1]), up(mid(k, L_HIP, R_HIP)[:, 1])
    knee, ank = up(mid(k, L_KNEE, R_KNEE)[:, 1]), up(mid(k, L_ANK, R_ANK)[:, 1])
    wri = up(mid(k, L_WRI, R_WRI)[:, 1])
    head = up(head_y(k, t))
    wri_xy, ank_xy = mid(k, L_WRI, R_WRI), mid(k, L_ANK, R_ANK)
    inverted = ank > sho + 0.3 * t
    overhead = (wri > head) & ~inverted
    # hanging: the hands sit still on a fixed bar while the feet travel; a barbell lift moves the hands, not the feet.
    # Judged over the frames with the hands above the hips (on the bar, or the bar off the floor)
    hang = False
    on = np.where((wri > hip + 0.3 * t) & ~inverted)[0]
    if len(on) >= fps:
        spread = lambda p: 2 * np.nanpercentile(np.linalg.norm(p[on] - np.nanmedian(p[on], axis=0), axis=1), 90)
        hand, foot = spread(wri_xy), spread(ank_xy)
        hang = bool(foot > 0.5 * t and foot > 2.0 * hand)
    floor_lift = bool(((wri < knee) & ~inverted).any() and (wri > hip + 0.3 * t).any())
    at_sho = (np.abs(wri - sho) < 0.35 * t) & ~inverted
    return {"inverted_s": float(inverted.sum() / fps), "overhead_s": float(overhead.sum() / fps), "hanging": bool(hang),
            "floor_lift": floor_lift, "at_shoulders_s": float(at_sho.sum() / fps), "torso_px": t}


def family(sig):
    if sig is None:
        return None
    if sig["inverted_s"] >= 1.0:
        return "inverted"
    if sig["hanging"]:
        return "hanging"
    if sig["floor_lift"] or sig["at_shoulders_s"] >= 0.5:
        return "barbell"
    return None


def check(movement, sig):
    """(ok, message). Rejects only a clear mismatch (a snatch tagged as a pull-up); an unclear clip goes on to the
    analysis, which fails on its own terms if it finds no reps."""
    if movement not in FAMILY:
        return False, f"{movement.replace('_', ' ')} analysis is not available."
    if sig is None:
        return False, "Could not find a person in this clip."
    fam = family(sig)
    want = FAMILY[movement]
    if fam is not None and fam != want:
        return False, f"This clip looks like {NAMES[fam]}, not a {NAMES[movement]}. Pick the movement you filmed and try again."
    return True, None
