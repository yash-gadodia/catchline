"""Fault rules (03-fault-taxonomy.md, 23-gymnastics.md) over measured values. Pure functions, no IO."""

# fault id -> threshold, unit, lift order (where in the lift the fault starts; the causal chain for gymnastics).
# horizontal = projection-sensitive (horizontal distance or a 2D joint angle), so capped off side-on.
# below = the fault is a value under the threshold (too little push-away).
RULES = {
    "hips_rise_early": {"threshold": 8.0, "unit": "cm", "order": 1, "horizontal": False},
    "bar_forward_off_hips": {"threshold": 10.0, "unit": "cm", "order": 2, "horizontal": True},
    "jump_forward": {"threshold": 5.0, "unit": "cm", "order": 3, "horizontal": True},
    # clean: 03 MVP #4 (early arm bend, 160 deg for the clean) and #6 (cut pull); 0.1 s = 3 frames at 30 fps
    "early_arm_bend": {"threshold": 0.1, "unit": "s", "order": 1.5, "horizontal": True},
    "incomplete_extension": {"threshold": 8.0, "unit": "deg", "order": 1.8, "horizontal": True},
    # jerk: 03 MVP #8, #7, #9, #10 (thresholds a notch above the taxonomy's for phone noise)
    "forward_dip": {"threshold": 4.0, "unit": "cm", "order": 1, "horizontal": True},
    "press_out": {"threshold": 15.0, "unit": "deg", "order": 2, "horizontal": True},
    "chest_dive": {"threshold": 15.0, "unit": "deg", "order": 3, "horizontal": True},
    "bar_forward_overhead": {"threshold": 6.0, "unit": "cm", "order": 4, "horizontal": True},
    # gymnastics v1 (23 section 6.1), conservative: kip K2 -> K1 -> K3, BMU B1 -> B2 -> B3, HSPU H2 -> H1
    "leg_kip": {"threshold": 50.0, "unit": "deg", "order": 1, "horizontal": True},
    "early_arm_pull": {"threshold": 0.13, "unit": "s", "order": 2, "horizontal": True},
    "no_push_away": {"threshold": 4.0, "unit": "cm", "order": 3, "horizontal": True, "below": True},
    "bmu_early_pull": {"threshold": 45.0, "unit": "cm", "order": 1, "horizontal": False},
    "hips_low_transition": {"threshold": 30.0, "unit": "cm", "order": 2, "horizontal": False},
    "chicken_wing": {"threshold": 0.12, "unit": "s", "order": 3, "horizontal": False},
    "hspu_banana": {"threshold": 10.0, "unit": "cm", "order": 1, "horizontal": True},
    "hspu_kip_timing": {"threshold": 10.0, "unit": "cm", "order": 2, "horizontal": False},
}

FAULTS = {
    "snatch": ["hips_rise_early", "bar_forward_off_hips", "jump_forward"],
    "clean": ["hips_rise_early", "early_arm_bend", "incomplete_extension", "bar_forward_off_hips", "jump_forward"],
    "jerk": ["forward_dip", "press_out", "chest_dive", "bar_forward_overhead"],
    "kipping_pull_up": ["leg_kip", "early_arm_pull", "no_push_away"],
    "bar_muscle_up": ["bmu_early_pull", "hips_low_transition", "chicken_wing"],
    "kipping_hspu": ["hspu_banana", "hspu_kip_timing"],
}
# gymnastics reports the earliest fault in the causal chain (23 section 6.1); the barbell lifts the most severe
CAUSAL = {"kipping_pull_up", "bar_muscle_up", "kipping_hspu"}

# 25-cue-library.md section 4: the primary cue per fault (under 8 words, external focus)
CUES = {
    "early_arm_bend": "Let the bar hang; stand up through it.",
    "hips_rise_early": "Push the floor down, chest comes up.",
    "bar_forward_off_hips": "Brush the bar up, don't bump it.",
    "jump_forward": "Land on the line you started on.",
    "incomplete_extension": "Finish tall, then drop.",
    "press_out": "Punch the bar up as your feet land.",
    "forward_dip": "Dip straight down the elevator shaft.",
    "bar_forward_overhead": "Finish with the bar behind your ears.",
    "chest_dive": "Lead the split with your front heel.",
    "early_arm_pull": "Press the bar down before you bend.",
    "leg_kip": "Glue your feet; swing from the bar.",
    "no_push_away": "Chin over, then push the bar away.",
    "bmu_early_pull": "Push the bar down, swing past it.",
    "hips_low_transition": "Drive your knees up to the bar.",
    "chicken_wing": "Send both elbows over at once.",
    "hspu_kip_timing": "Knees to elbows, then kick the ceiling.",
    "hspu_banana": "Drive your heels up the wall.",
}
# section 4 why templates, {m} = the measurement in plain units (section 5: integers, 1 cm, 2 deg, 10 ms)
WHY = {
    "early_arm_bend": "Your elbows bent {m} before your hips finished, so the bar lost leg speed.",
    "hips_rise_early": "Your back angle dropped {m} between the floor and the knee, which put the bar in front of you.",
    "bar_forward_off_hips": "The bar flew {m} forward after hip contact, so you had to chase it.",
    "jump_forward": "Your feet landed {m} in front of where they started.",
    "incomplete_extension": "Your hips stopped {m} short of straight before you went under.",
    "press_out": "Your elbows were {m} short of locked when the bar peaked, then pressed the rest.",
    "forward_dip": "The bar moved {m} forward during your dip, so the drive went forward too.",
    # the table's reference is the ear; no head points are kept, so the shoulder line stands in for it
    "bar_forward_overhead": "The bar locked out {m} in front of your shoulder line.",
    "chest_dive": "Your torso leaned {m} forward in the split, leaving your hips behind the bar.",
    "early_arm_pull": "Your elbows bent {m} before your hips opened, turning the kip into a strict pull.",
    "leg_kip": "Your knees bent {m} each swing while your shoulders barely moved.",
    "no_push_away": "You dropped straight down after the rep, so the next swing had nothing to load.",
    "bmu_early_pull": "Your elbows bent with your hips {m} below the bar; you pulled to it, not around it.",
    "hips_low_transition": "Your hips peaked {m} below the bar; aim for about 20 cm.",
    "chicken_wing": "Your {side} elbow crossed the bar {m} behind the other.",
    "hspu_kip_timing": "Your knees stopped {m} above your hips before the kick, so the hips gave no drive.",
    "hspu_banana": "Your hips sat {m} off the wall at the top.",
}
# causal gating (25 section 4, 03 section 6): when both fire, the cause is cued, not the effect
GATES = [("bar_forward_off_hips", "jump_forward"), ("hips_rise_early", "early_arm_bend"),
         ("hips_low_transition", "chicken_wing"), ("hspu_banana", "hspu_kip_timing")]


def gate(fired_ids):
    return {f for f in fired_ids if not any(e == f and c in fired_ids for c, e in GATES)}


def fmt(value, unit):
    if unit == "s":
        return f"{int(round(value * 100)) * 10} ms"
    if unit == "deg":
        return f"{int(2 * round(value / 2))} deg"
    return f"{int(round(value))} cm"


def fired(values):
    """values: {fault_id: measured value or None}. Returns {fault_id: severity} for faults over threshold."""
    out = {}
    for fid, v in values.items():
        if v is None:
            continue
        thr = RULES[fid]["threshold"]
        sev = (1.0 + (thr - v) / thr) if RULES[fid].get("below") else v / thr
        if sev >= 1.0:
            out[fid] = sev
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
