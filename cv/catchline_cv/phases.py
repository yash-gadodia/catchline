import numpy as np

SNATCH_PHASES = ["setup", "first_pull", "transition", "second_pull", "turnover", "catch", "recovery"]


def segment_snatch(bar_h, knee, fps, knee_pass=None, elbow=None, setup_s=1.0, min_rebend=3.0, catch_mask=None, liftoff=None):
    """Segment one snatch rep.

    bar_h: bar height per frame, up positive (any unit), smoothed. knee: knee angle per frame (deg), smoothed.
    knee_pass: optional frame where the bar passes knee height (fallback for the first pull end).
    elbow: optional elbow angle per frame (deg); the catch is the first lockout (>= 150; foreshortened off side-on) from the peak.
    catch_mask: optional bool per frame that replaces the elbow lockout as "bar received" (the clean's front rack).
    liftoff: optional frame the bar left the floor (from the plate), used instead of the wrists' own.
    Returns (phases, events) with frames as indices into the arrays.
    """
    bar_h, knee = np.asarray(bar_h, float), np.asarray(knee, float)
    n = len(bar_h)
    top = int(np.argmax(bar_h))
    floor = float(np.min(bar_h[: top + 1]))
    rng = bar_h[top] - floor
    below = np.where(bar_h[: top + 1] <= floor + 0.03 * rng)[0]
    if liftoff is None:
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
    else:
        # a power snatch received without a dip: the wrists creep up as the lifter stands, so the highest point is
        # the stand-up. The turnover ends where the fast rise stops (under a fifth of its top speed)
        fast = liftoff + int(np.argmax(v[liftoff: top + 1]))
        slow = np.where(v[fast: top + 1] < 0.2 * v[fast])[0]
        if len(slow):
            peak = fast + int(slow[0])

    from_hang = False
    if catch_mask is not None and np.asarray(catch_mask, bool).any():
        # clean: the peak is the bar's highest point before it lands in the rack. A pull that does not reach the rack
        # (an aborted attempt, then a clean from the hang) leaves a long gap: start at the final upward drive.
        r0 = int(np.argmax(np.asarray(catch_mask, bool)))
        peak = int(np.argmax(bar_h[: r0 + 1]))
        liftoff = min(liftoff, peak)
        if peak - liftoff > 2.0 * fps:
            f = peak
            while f > liftoff and bar_h[f - 1] < bar_h[f]:
                f -= 1
            liftoff, from_hang = f, True
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
    if catch_mask is not None:
        locked = np.where(np.asarray(catch_mask, bool)[peak:window])[0]
    else:
        locked = np.where(np.asarray(elbow)[peak:window] >= 150)[0] if elbow is not None else []
    if len(locked):
        caught = peak + int(locked[0])
    else:
        descent = -v[peak:window]
        m = int(np.argmax(descent))
        slow = np.where(descent[m:] < 0.25 * descent[m])[0]
        caught = peak + m + (int(slow[0]) if len(slow) else len(descent) - 1 - m)
    # the overhead hold ends when the bar is lowered or dropped (or lost in a miss); search only inside it
    gone = np.where(bar_h[caught:] < floor + 0.35 * rng)[0]
    hold_end = caught + int(gone[0]) if len(gone) else n
    # catch phase runs to the bottom of the catch (squat or power); recovery stands until the bar is ~90% back up
    # bottom = lowest bar between the catch and the stand-up (the bar passing halfway from the catch height back
    # to the top of the hold); squat and power ride-downs alike. Without a stand-up (a miss) search the next 4 s.
    hold = bar_h[caught: max(caught + 1, min(hold_end, n))]
    dipped = np.where(hold < hold[0] - 0.03 * rng)[0]
    up_again = np.where(hold >= hold[0] + 0.5 * (hold.max() - hold[0]))[0]
    # a catch with no ride-down stands up (the bar rises over a tenth of the lift) before any dip; the first dip is
    # then the bar being lowered after the lift
    stood_first = hold.max() - hold[0] > 0.1 * rng and len(dipped) and up_again[0] < dipped[0]
    if len(dipped) and not stood_first:
        up_again = up_again[up_again > dipped[0]]
        stop = int(up_again[0]) if len(up_again) else int(4 * fps)
    else:
        stop = int(0.5 * fps)
    bottom = caught + int(np.argmin(hold[: max(1, stop)]))
    after = bar_h[bottom: max(bottom + 1, hold_end)]
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
              "caught": caught, "catch_bottom": bottom, "recovered": recovered, "hold_end": hold_end, "double_knee_bend": double_bend}
    if catch_mask is not None:
        events["from_hang"] = from_hang
    return phases, events


def plate_liftoff(plate_y, start, diameter, rise=0.05):
    """The last frame the plate sat on the floor: the first frame from `start` where it has risen `rise` plate
    diameters above where it sat at `start`, walked back to where that rise began. plate_y: image y (down positive)
    per frame. None when the plate track is lost before it rises."""
    y = np.asarray(plate_y, float)
    near = y[max(0, start - 5): start + 1]
    if not np.isfinite(near).any():
        return None
    base = float(np.nanmedian(near))
    for f in range(start, len(y)):
        if not np.isfinite(y[f]):
            return None
        if base - y[f] > rise * diameter:
            while f > start and y[f - 1] > y[f]:
                f -= 1
            return f
    return None


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
                if reps and not low[reps[-1][1]: i].any():
                    # back overhead without the bar coming down past the knees (a catch dip, an overhead squat,
                    # or a pose glitch): still the same rep
                    reps[-1] = (reps[-1][0], j - 1, reps[-1][2])
                elif len(lows):
                    start = int(lows[-1])
                    if not reps or start > reps[-1][1]:
                        reps.append((start, j - 1, i))
            i = j
        else:
            i += 1
    return reps


def catch_depth(hip_h, knee_h, knee_ang, start, end, squat_knee_deg=65.0):
    """Deepest point of the catch: the frame in [start, end] where the hip is lowest. Returns (frame, cm-free depth =
    how far the hip joint sits below the knee joint, up-positive inputs, kind). Joint centres sit near level even in a
    full squat, so the kind comes from the knee angle: under squat_knee_deg is a squat catch, else a power catch."""
    hip_h, knee_h, knee_ang = (np.asarray(x, float) for x in (hip_h, knee_h, knee_ang))
    end = max(start, min(end, len(hip_h) - 1))
    f = start + int(np.argmin(hip_h[start: end + 1]))
    kind = "squat" if np.min(knee_ang[start: end + 1]) < squat_knee_deg else "power"
    return f, float(knee_h[f] - hip_h[f]), kind


CLEAN_PHASES = SNATCH_PHASES
JERK_PHASES = ["setup", "drive", "turnover", "catch", "recovery"]


def runs(mask, min_len=1):
    """[(start, end_inclusive)] of True runs at least min_len long."""
    m = np.asarray(mask, bool)
    out, i, n = [], 0, len(m)
    while i < n:
        if m[i]:
            j = i
            while j < n and m[j]:
                j += 1
            if j - i >= min_len:
                out.append((i, j - 1))
            i = j
        else:
            i += 1
    return out


def find_rack_reps(wrist_h, knee_h, rack, fps, min_rack_s=0.3):
    """Clean reps: wrists from below the knees to a front-rack hold (rack mask true for min_rack_s).
    Returns [(start, end, rack_start)]; end is the end of the rack hold (a jerk or the drop ends it)."""
    low = np.asarray(wrist_h) < np.asarray(knee_h)
    reps = []
    for a, b in runs(rack, max(1, int(min_rack_s * fps))):
        lows = np.where(low[:a])[0]
        if not len(lows):
            continue
        start = int(lows[-1])
        if reps and start <= reps[-1][1]:
            reps[-1] = (reps[-1][0], b, reps[-1][2])
            continue
        reps.append((start, b, a))
    return reps


def find_jerk_reps(at_shoulders, overhead, fps, min_s=0.3, max_gap_s=3.0):
    """Jerk reps: a hold at the shoulders followed within max_gap_s by an overhead hold.
    Returns [(start, end, overhead_start)]: start = start of the shoulder hold, end = end of the overhead hold."""
    k = max(1, int(min_s * fps))
    racks = runs(at_shoulders, k)
    reps = []
    for a, b in runs(overhead, k):
        before = [r for r in racks if r[1] < a and a - r[1] <= max_gap_s * fps]
        if not before:
            continue
        start = before[-1][0]
        if reps and start <= reps[-1][1]:
            continue
        reps.append((start, b, a))
    return reps


def segment_jerk(bar_h, knee, elbow, fps, setup_s=1.0):
    """Segment one jerk from the rack: dip, drive, the bar leaving the shoulders, landing under it, recovery.

    bar_h: bar height per frame (up positive), starting in the rack hold. knee, elbow: angles (deg).
    Returns (phases, events) with frames as indices into the arrays."""
    bar_h, knee, elbow = (np.asarray(x, float) for x in (bar_h, knee, elbow))
    n = len(bar_h)
    top = int(np.argmax(bar_h))
    # the dip bottom is the lowest bar before it goes overhead; the dip starts where the bar was last still (the rack
    # pause). A descent longer than 60% of the drive is the bar being lowered into the rack, not a dip: no dip then.
    dip_bottom = int(np.argmin(bar_h[: max(1, top)]))
    rng = max(1e-6, bar_h[top] - bar_h[dip_bottom])
    dip_start = dip_bottom
    while dip_start > 0 and bar_h[dip_start - 1] > bar_h[dip_start] + 0.005 * rng:
        dip_start -= 1
    if bar_h[dip_start] - bar_h[dip_bottom] > 0.6 * rng:
        dip_start = dip_bottom
    rack_h = float(bar_h[dip_start])
    rng = max(1e-6, bar_h[top] - rack_h)
    # the bar leaves the shoulders once it is back up to rack height after the dip
    back = np.where(bar_h[dip_bottom: top + 1] >= rack_h)[0]
    leave = dip_bottom + (int(back[0]) if len(back) else 0)
    # landing = the knees' lowest point after the drive (feet hit the floor and absorb); push or split alike
    win = slice(leave, min(n, leave + int(0.8 * fps)))
    land = leave + int(np.argmin(knee[win])) if win.stop > leave else leave
    land = max(land, leave + 1) if land + 1 < n else land
    later = bar_h[land:]
    bottom = land + int(np.argmin(later[: max(1, int(0.5 * fps))]))
    after = bar_h[bottom:]
    stood = np.where((after >= bar_h[bottom] + 0.9 * (after.max() - bar_h[bottom])) & (knee[bottom:] > 150))[0]
    recovered = bottom + int(stood[0]) if len(stood) else n - 1
    gone = np.where(bar_h[top:] < rack_h)[0]
    hold_end = top + int(gone[0]) if len(gone) else n
    bounds = [max(0, dip_start - int(setup_s * fps)), dip_start, leave, land, bottom, recovered]
    for i in range(1, len(bounds)):
        bounds[i] = max(bounds[i], bounds[i - 1] + 1)
    bounds = [min(b, n - 1) for b in bounds]
    spans = [(bounds[0], bounds[1] - 1)] + [(bounds[i] + (i > 1), bounds[i + 1]) for i in range(1, 5)]
    phases = [{"name": name, "startFrame": int(s), "endFrame": int(max(s, e))} for name, (s, e) in zip(JERK_PHASES, spans)]
    events = {"dip_start": dip_start, "dip_bottom": dip_bottom, "leave": leave, "land": land, "top": top,
              "catch_bottom": bottom, "recovered": recovered, "hold_end": hold_end}
    return phases, events


def jerk_key_frames(ev):
    return {"setup": max(0, ev["dip_start"] - 1), "drive": ev["dip_bottom"], "turnover": ev["leave"],
            "catch": ev["land"], "recovery": ev["recovered"]}
