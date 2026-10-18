"""Fault rules (03-fault-taxonomy.md, 23-gymnastics.md) over measured values. Pure functions, no IO beyond loading
rules.json, the data this module shares with the app's src/analysis/device/rules.ts so the two cannot drift."""
import json
import math
from pathlib import Path

_DATA = json.loads((Path(__file__).parent / "rules.json").read_text())

# RULES: fault id -> threshold, unit, lift order (where in the lift the fault starts; the causal chain for gymnastics).
# horizontal = projection-sensitive (horizontal distance or a 2D joint angle), so capped off side-on.
# below = the fault is a value under the threshold (too little push-away).
# Where the thresholds come from:
# - jump_forward 8 cm: 03's lenient 5 cm plus ~3 cm of foot-point noise: a made power snatch whose heel landed on its
#   start line read 5.3 cm (original) and 6.3 cm (app transcode), and at 5 cm the jump outranked every other fault
# - early_arm_bend 0.1 s, incomplete_extension 8 deg: clean 03 MVP #4 (early arm bend, 160 deg for the clean) and #6
#   (cut pull); 0.1 s = 3 frames at 30 fps. The snatch bends at 150 deg, 03's 165 less a margin for ~10 deg of elbow
#   keypoint error (CF L1, Everett)
# - slow_turnover 0.45 s: snatch S6, full knee extension to elbow lockout: 03 flags > 450 ms; elite 235 +- 20 ms
#   (JSSM 11:162 table 2), beginners 0.4-0.7 s (Torokhtiy). Horizontal: the lockout frame is a 2D elbow angle, read
#   late off side-on
# - bar_crash 25 cm: snatch S6 drop, bar peak to elbow lockout: Nagao 2019 elite 17 +- 4 cm (made) vs 18 cm (missed),
#   03's novice flag > 25 cm. Horizontal for the same reason: a late lockout frame reads as a longer drop
# - jerk: 03 MVP #8, #7, #9, #10 (thresholds a notch above the taxonomy's for phone noise)
# - gymnastics v1 (23 section 6.1), conservative: kip K2 -> K1 -> K3, BMU B1 -> B2 -> B3, HSPU H2 -> H1
RULES = _DATA["RULES"]
FAULTS = _DATA["FAULTS"]
# gymnastics reports the earliest fault in the causal chain (23 section 6.1); the barbell lifts the most severe
CAUSAL = set(_DATA["CAUSAL"])
# snatch rules no coach label has calibrated yet: never "clear" until one does
UNCALIBRATED_SNATCH = set(_DATA["UNCALIBRATED_SNATCH"])

# 25-cue-library.md section 4: the primary cue per fault (under 8 words, external focus)
CUES = _DATA["CUES"]
# other ways to say each cue, from docs/catchline/fault-catalog: [{"text", "source"}] per fault id
ALTERNATES = _DATA["ALTERNATES"]
# section 4 why templates, {m} = the measurement in plain units (section 5: integers, 1 cm, 2 deg, 10 ms).
# bar_forward_overhead: the table's reference is the ear; no head points are kept, so the shoulder line stands in for it
WHY = _DATA["WHY"]
# causal gating (25 section 4, 03 section 6): when both fire, the cause is cued, not the effect
GATES = [tuple(g) for g in _DATA["GATES"]]
# a cause measured at half its threshold still explains a fired effect: the jump threshold sits under the 10 cm swing
# one, so a 6 cm swing that throws the feet 9 cm forward was being cued as the jump
PRESENT = _DATA["PRESENT"]


def gate(fired_ids):
    return {f for f in fired_ids if not any(e == f and c in fired_ids for c, e in GATES)}


def fmt(value, unit):
    if unit == "s":
        return f"{int(round(value * 100)) * 10} ms"
    if unit == "deg":
        return f"{int(2 * round(value / 2))} deg"
    return f"{int(round(value))} cm"


def severity(fid, v):
    thr = RULES[fid]["threshold"]
    return (1.0 + (thr - v) / thr) if RULES[fid].get("below") else v / thr


def on_screen(values, off):
    """Values for choosing the cue when filmed off side-on. A forward distance is stored corrected by 1/cos(off), but
    its on-screen value can only read short of the truth, so a fault that fires on it is real (20-70 deg). Steeper
    than 70 deg no forward distance is judged. Shown values stay corrected; only the choice uses these."""
    if off is None or off <= 20:
        return values
    out = dict(values)
    for fid, v in values.items():
        r = RULES.get(fid)
        if v is not None and r and r["horizontal"] and r["unit"] == "cm" and not r.get("below"):
            out[fid] = v * math.cos(math.radians(off)) if off <= 70 else None
    return out



def confirmed_off_side(fid, sev, off):
    """A forward distance that fired on its on-screen value (severity from on_screen) at 20-70 deg off side-on: real,
    so worth checking rather than held back as low (e3b87054, 18 Oct: jump 8.2 cm on screen at 58 deg)."""
    r = RULES[fid]
    return (off is not None and 20 < off <= 70 and r["horizontal"] and r["unit"] == "cm" and not r.get("below")
            and sev >= 1.0)


def fired(values):
    """values: {fault_id: measured value or None}. Returns {fault_id: severity} for faults over threshold, plus the
    cause of a fired effect when the cause measured at least PRESENT of its threshold (at the effect's severity)."""
    out = {fid: severity(fid, v) for fid, v in values.items() if v is not None and severity(fid, v) >= 1.0}
    for c, e in GATES:
        if e in out and c not in out and values.get(c) is not None and severity(c, values[c]) >= PRESENT:
            out[c] = out[e]
    return out


def choose_cue(values):
    """Most severe fault wins; ties go to the earlier fault in the lift. None when nothing fires."""
    f = fired(values)
    keep = gate(set(f))
    if not keep:
        return None
    return max(keep, key=lambda k: (round(f[k], 2), -RULES[k]["order"]))


def choose_set_cue(movement, reps_values):
    """Set-level cue. reps_values: [{fault_id: value}] per rep. Gymnastics: the earliest fault in the causal chain
    that fires on 2+ reps, else the earliest that fires at all. Barbell: the most severe single-rep fault (as the
    snatch). Returns (fault_id or None, reps it fired on)."""
    seen = {}
    for vals in reps_values:
        for fid, sev in fired(vals).items():
            seen.setdefault(fid, []).append(sev)
    if not seen:
        return None, 0
    seen = {f: v for f, v in seen.items() if f in gate(set(seen))}
    order = lambda f: RULES[f]["order"]
    if movement in CAUSAL:
        repeat = [f for f in seen if len(seen[f]) >= 2]
        fid = min(repeat or list(seen), key=order)
    else:
        fid = max(seen, key=lambda f: (round(max(seen[f]), 2), -order(f)))
    return fid, len(seen[fid])


def notes(movement, reps, cue, limit=3):
    """The other faults worth a look under the headline cue. reps: [{"values", "detail"}] per rep. Ranked as the
    set cue is (gymnastics: repeating first, then causal order; barbell: most severe, ties to the earlier fault),
    gated across the set, the headline (its fault or its cue text) left out. Each note's why comes from the rep
    where it was most severe. Empty when there is no headline cue."""
    if cue is None:
        return []
    seen = {}
    for i, r in enumerate(reps):
        for fid, sev in fired(r["values"]).items():
            seen.setdefault(fid, []).append((sev, i))
    keep = [f for f in gate(set(seen)) if f != cue["faultId"] and CUES[f] != cue["text"]]
    order = lambda f: RULES[f]["order"]
    if movement in CAUSAL:
        keep.sort(key=lambda f: (len(seen[f]) < 2, order(f)))
    else:
        keep.sort(key=lambda f: (-round(max(seen[f])[0], 2), order(f)))
    out = []
    for fid in keep[:limit]:
        sev, i = max(seen[fid])
        r = reps[i]
        out.append({"faultId": fid, "text": CUES[fid], "why": why_sentence(fid, r["values"], r["detail"].get(fid)),
                    "severity": round(sev, 2), "reps": len(seen[fid])})
    return out


def confidence(fault_id, severity, side_on_off_deg):
    """Camera angle caps confidence: horizontal distances are foreshortened off side-on; vertical ones survive."""
    if side_on_off_deg is None or side_on_off_deg <= 20:
        return "clear" if severity >= 1.5 else "worth_checking"
    if RULES[fault_id]["horizontal"]:
        return "low"
    return "worth_checking" if severity >= 1.5 else "low"


def rep_confidence(conf, seen, total):
    """Repetition gates 'clear': the fault must fire on every rep, and on at least two of them."""
    if conf == "clear" and (seen < 2 or seen < total):
        return "worth_checking"
    return conf


def why_sentence(fault_id, values, detail=None):
    """The section 4 template filled with this rep's measurement. detail carries the raw angle or side some templates
    name instead of the rule value (the back angle for hips-rise-early, the elbow angle for press-out)."""
    d = detail or {}
    v = values[fault_id]
    unit = RULES[fault_id]["unit"]
    if fault_id == "hips_rise_early" and d.get("trunk_change") is not None:
        m = fmt(d["trunk_change"], "deg")
    elif fault_id == "incomplete_extension" and d.get("hip_max") is not None:
        m = fmt(180.0 - d["hip_max"], "deg")
    elif fault_id == "press_out" and d.get("elbow_land") is not None:
        m = fmt(180.0 - d["elbow_land"], "deg")
    elif fault_id == "chicken_wing" and d.get("gap_s") is not None:
        m = fmt(d["gap_s"], "s")
    else:
        m = fmt(v, unit)
    return WHY[fault_id].format(m=m, side=d.get("side", "late"))
