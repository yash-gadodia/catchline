import numpy as np

SNATCH_PHASES = ["setup", "first_pull", "transition", "second_pull", "turnover", "catch", "recovery"]


def segment_snatch(bar_h, knee, fps, knee_pass=None, elbow=None, setup_s=1.0, min_rebend=3.0):
    """Segment one snatch rep.

    bar_h: bar height per frame, up positive (any unit), smoothed. knee: knee angle per frame (deg), smoothed.
    knee_pass: optional frame where the bar passes knee height (fallback for the first pull end).
    elbow: optional elbow angle per frame (deg); the catch is the first lockout (>= 150; foreshortened off side-on) from the peak.
    Returns (phases, events) with frames as indices into the arrays.
    """
    bar_h, knee = np.asarray(bar_h, float), np.asarray(knee, float)
    n = len(bar_h)
    top = int(np.argmax(bar_h))
    floor = float(np.min(bar_h[: top + 1]))
    rng = bar_h[top] - floor
    below = np.where(bar_h[: top + 1] <= floor + 0.03 * rng)[0]
    liftoff = int(below[-1])
    while liftoff > 0 and bar_h[liftoff] - bar_h[liftoff - 1] > 0.01 * rng:
        liftoff -= 1
    # turnover peak = first local max once the bar is past half its rise (a squat snatch stands up higher later)
    v = np.gradient(bar_h)
    peak = top
    for f in range(liftoff + 1, top):
        if bar_h[f] > floor + 0.5 * rng and bar_h[f - 1] <= bar_h[f] > bar_h[f + 1]:
            later = bar_h[f + 1:]
            higher = np.where(later > bar_h[f])[0]
            dip = later[: higher[0]] if len(higher) else later
            if len(dip) and bar_h[f] - dip.min() >= 0.03 * rng:
                peak = f
                break

    s2 = liftoff + int(np.argmax(knee[liftoff: peak + 1]))
    seg = knee[liftoff: s2 + 1]
    rebend = np.maximum.accumulate(seg) - seg
    trans = liftoff + int(np.argmax(rebend))
    if rebend.max() >= min_rebend and liftoff < trans < s2:
        k1 = liftoff + int(np.argmax(knee[liftoff: trans + 1]))
        double_bend = True
    else:
        k1 = knee_pass if knee_pass is not None and liftoff < knee_pass < s2 else liftoff + int(0.4 * (s2 - liftoff))
        trans = (k1 + s2) // 2
        double_bend = False

    # catch = bar received: first elbow lockout after the peak, else descent speed decays below a quarter of its max
    window = min(n, peak + int(1.0 * fps))
    locked = np.where(np.asarray(elbow)[peak:window] >= 150)[0] if elbow is not None else []
    if len(locked):
        caught = peak + int(locked[0])
    else:
        descent = -v[peak:window]
        m = int(np.argmax(descent))
        slow = np.where(descent[m:] < 0.25 * descent[m])[0]
        caught = peak + m + (int(slow[0]) if len(slow) else len(descent) - 1 - m)
    # catch phase runs to the bottom of the squat; recovery stands until the bar is ~90% of the way back up
    bottom = caught + int(np.argmin(bar_h[caught: min(n, caught + int(4 * fps))]))
    after = bar_h[bottom:]
    stood = np.where(after >= bar_h[bottom] + 0.9 * (after.max() - bar_h[bottom]))[0]
    recovered = bottom + int(stood[0]) if len(stood) and after.max() - bar_h[bottom] > 0.05 * rng else n - 1

    bounds = [max(0, liftoff - int(setup_s * fps)), liftoff, k1, trans, s2, peak, bottom, recovered]
    for i in range(1, len(bounds)):
        bounds[i] = max(bounds[i], bounds[i - 1] + 1)
    bounds = [min(b, n - 1) for b in bounds]
    spans = [(bounds[0], bounds[1] - 1), (bounds[1], bounds[2])]
    spans += [(bounds[i] + 1, bounds[i + 1]) for i in range(2, 7)]
    phases = [{"name": name, "startFrame": int(s), "endFrame": int(max(s, e))}
              for name, (s, e) in zip(SNATCH_PHASES, spans)]
    events = {"liftoff": liftoff, "first_ext": k1, "rebend": trans, "second_ext": s2, "peak": peak,
              "caught": caught, "catch_bottom": bottom, "recovered": recovered, "double_knee_bend": double_bend}
    return phases, events


def key_frames(events):
    return {"setup": max(0, events["liftoff"] - 1), "first_pull": events["first_ext"], "transition": events["rebend"],
            "second_pull": events["second_ext"], "turnover": (events["second_ext"] + events["peak"]) // 2, "catch": events["caught"],
            "recovery": events["recovered"]}


def find_reps(wrist_h, nose_h, knee_h, fps, min_overhead_s=0.3):
    """Snatch-style reps: wrists go from below the knees to above the nose. Returns [(start, end, overhead_start)].
    All heights up positive."""
    over = np.asarray(wrist_h) > np.asarray(nose_h)
    low = np.asarray(wrist_h) < np.asarray(knee_h)
    reps, i, n = [], 0, len(over)
    while i < n:
        if over[i]:
            j = i
            while j < n and over[j]:
                j += 1
            if (j - i) >= min_overhead_s * fps:
                lows = np.where(low[:i])[0]
                if len(lows):
                    start = int(lows[-1])
                    if not reps or start > reps[-1][1]:
                        reps.append((start, j - 1, i))
            i = j
        else:
            i += 1
    return reps
