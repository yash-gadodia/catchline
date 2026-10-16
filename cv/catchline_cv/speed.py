"""Peak bar speed in the pull (m/s): an extra measurement for the app's readouts and Trends. It never feeds cue
selection (rules.py). The window runs lift-off to the catch: the fastest point of a snatch or clean is the second pull,
and a squat lift's stand-up (where the bar is highest) is slower and outside it."""
import numpy as np

# No barbell lift moves the bar outside this; a number beyond it is a tracking jump, not a speed.
PLAUSIBLE = (0.5, 4.0)


def peak_up_speed(y_px, fps, px_per_cm, start, end):
    """(m/s, frame) of the fastest upward bar movement between frames start..end, from a per-frame bar y in image px
    (y grows downward). None when the window is too short or the scale or frame rate is missing."""
    y = np.asarray(y_px, float)
    lo, hi = max(0, int(start)), min(len(y) - 1, int(end))
    if hi - lo < 2 or not px_per_cm or not fps:
        return None
    v = -np.gradient(y)[lo: hi + 1] * fps / px_per_cm / 100.0
    if not np.isfinite(v).any():
        return None
    i = int(np.nanargmax(v))
    return float(v[i]), lo + i


def measurement(r):
    """The bar_speed row for a rep from pipeline.analyse_rep. A scale from the near plate alone (no parallax) is too
    uncertain to time the bar, so the row says so instead of giving a number."""
    sp = r.get("bar_speed")
    hidden = lambda note: {"id": "bar_speed", "label": "Peak bar speed", "value": 0, "unit": "m/s",
                           "frame": r["events"]["second_ext"], "status": "not_seen", "note": note}
    if sp is None or r["scale_method"].startswith(("near plate only", "body segments")):
        return hidden("scale too uncertain to time the bar")
    if not PLAUSIBLE[0] <= sp[0] <= PLAUSIBLE[1]:
        return hidden("bar track too unsteady to time")
    return {"id": "bar_speed", "label": "Peak bar speed", "value": round(sp[0], 2), "unit": "m/s", "frame": sp[1],
            "status": "normal", "note": "peak upward speed in the pull"}
