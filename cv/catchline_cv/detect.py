"""Which barbell lift the clip shows, read from where the bar was received: overhead straight from the floor is a
snatch, at the shoulders from the floor a clean, from the shoulders to overhead with no pull from the floor a jerk.
Pure functions over the lifter's keypoints with camera motion removed (image px, y down)."""
import numpy as np

from . import movement as mv
from .geometry import angle, lowpass
from .lifts import rack_mask
from .phases import runs
from .pose import L_ANK, L_HIP, L_KNEE, L_SHO, L_WRI, R_ANK, R_HIP, R_KNEE, R_SHO, R_WRI

HOLD_S = 0.3          # a bar is received where it stays this long
FLOOR_S = 0.2         # wrists below the knees this long = the bar on the floor (or below the knee)
# heights are in torso lengths (shoulder to hip joint centres) above the shoulders. On the reference clips a snatch
# lockout sits 0.78-0.88 (the wrist point is below the hand), a front rack 0.10-0.26
OVERHEAD_T = 0.5
SURE_LOCK_T = 0.7
RACK_T = 0.35
SURE_RACK_T = 0.3
DIP_DEG = 15.0        # knee bend before the drive that makes a jerk a jerk, not a press (front-on noise reads 6-12)
FEET_T = 0.4          # a jerk's feet stay near the floor; a kip or muscle-up carries the whole body up
JERK_GAP_S = 3.0
STRONG, WEAK = 0.9, 0.7


def detect(k, fps, lifts=False):
    """{"movement": snatch | clean | jerk | unknown, "confidence": 0..1}. With lifts=True the per-lift reads come too.
    Weak signals (a low lockout, a press with no dip, lifts that disagree) drop the confidence; under 0.5 it is unknown."""
    ok = np.isfinite(k[:, [L_SHO, R_SHO, L_HIP, R_HIP]]).all(axis=(1, 2))
    if ok.sum() < fps:
        return summarise([], lifts)
    k = k[ok]
    n = len(k)
    ks = lowpass(k.reshape(n, -1), fps).reshape(k.shape)
    t = mv.torso_px(ks)
    bar = mv.mid(ks, L_WRI, R_WRI)
    wri, sho, knee = -bar[:, 1], -mv.mid(ks, L_SHO, R_SHO)[:, 1], -mv.mid(ks, L_KNEE, R_KNEE)[:, 1]
    ank = -mv.mid(ks, L_ANK, R_ANK)[:, 1]
    h = (wri - sho) / t
    overhead = h > OVERHEAD_T
    rack = rack_mask(ks, bar, fps)
    at_sho = np.abs(h) < RACK_T
    knee_ang = (angle(ks[:, L_HIP], ks[:, L_KNEE], ks[:, L_ANK]) + angle(ks[:, R_HIP], ks[:, R_KNEE], ks[:, R_ANK])) / 2
    hold = max(1, int(HOLD_S * fps))
    floor = runs(wri < knee, max(1, int(FLOOR_S * fps)))
    found = []

    # before the bar first touches the floor (or all clip without one) it can only come from the shoulders
    pre = floor[0][0] if floor else n
    racks, overs = runs(at_sho[:pre], hold), runs(overhead[:pre], hold)
    last = -1
    for oa, ob in overs:
        before = [r for r in racks if r[1] < oa and oa - r[1] <= JERK_GAP_S * fps]
        if not before or before[-1][0] <= last:
            continue
        ra = before[-1][0]
        last = ob
        feet = float(np.nanmax(ank[ra: ob + 1]) - np.nanmin(ank[ra: ob + 1])) / t
        if feet > FEET_T:
            continue
        dip = float(np.nanmax(knee_ang[ra: oa + 1]) - np.nanmin(knee_ang[ra: oa + 1]))
        found.append({"movement": "jerk", "confidence": STRONG if dip >= DIP_DEG else WEAK, "from_floor": False,
                      "frame": int(ra), "dip_deg": round(dip, 1), "feet_torsos": round(feet, 2)})

    # each pull from the floor: received wherever the bar first stays (the rack, so a clean and jerk is a clean)
    for i, (_, fb) in enumerate(floor):
        a, b = fb + 1, floor[i + 1][0] if i + 1 < len(floor) else n
        if b - a < hold:
            continue
        over, rk = runs(overhead[a:b], hold), runs(rack[a:b], hold)
        if rk and (not over or rk[0][0] < over[0][0]):
            s, e = rk[0]
            hh = float(np.median(np.abs(h[a + s: a + e + 1])))
            found.append({"movement": "clean", "confidence": STRONG if hh <= SURE_RACK_T else WEAK, "from_floor": True,
                          "frame": int(a + s), "hold_torsos": round(hh, 2)})
        elif over:
            s, e = over[0]
            hh = float(np.median(h[a + s: a + e + 1]))
            found.append({"movement": "snatch", "confidence": STRONG if hh >= SURE_LOCK_T else WEAK, "from_floor": True,
                          "frame": int(a + s), "hold_torsos": round(hh, 2)})
    return summarise(found, lifts)


def summarise(found, lifts):
    if not found:
        out = {"movement": "unknown", "confidence": 0.0}
    else:
        names = [f["movement"] for f in found]
        top = max(dict.fromkeys(names), key=names.count)
        agree = names.count(top) / len(names)
        conf = round(float(np.mean([f["confidence"] for f in found if f["movement"] == top])) * agree, 2)
        out = {"movement": top if conf >= 0.5 else "unknown", "confidence": conf}
    if lifts:
        out["lifts"] = found
    return out
