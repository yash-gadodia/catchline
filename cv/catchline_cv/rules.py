"""Snatch fault rules (03-fault-taxonomy.md) over measured values. Pure functions, no IO."""

# fault id -> (threshold, unit, lift order). Order = where in the lift the fault starts.
RULES = {
    "hips_rise_early": {"threshold": 8.0, "unit": "cm", "order": 1, "horizontal": False},
    "bar_forward_off_hips": {"threshold": 10.0, "unit": "cm", "order": 2, "horizontal": True},
    "jump_forward": {"threshold": 5.0, "unit": "cm", "order": 3, "horizontal": True},
}

CUES = {
    "hips_rise_early": "Chest and bar leave the floor together",
    "bar_forward_off_hips": "Brush the bar up your body",
    "jump_forward": "Land where you started",
}


def fired(values):
    """values: {fault_id: measured value or None}. Returns {fault_id: severity} for faults over threshold."""
    out = {}
    for fid, v in values.items():
        if v is None:
            continue
        sev = v / RULES[fid]["threshold"]
        if sev >= 1.0:
            out[fid] = sev
    return out


def choose_cue(values):
    """Most severe fault wins; ties go to the earlier fault in the lift. None when nothing fires."""
    f = fired(values)
    if not f:
        return None
    return max(f, key=lambda k: (round(f[k], 2), -RULES[k]["order"]))


def confidence(fault_id, severity, side_on_off_deg):
    """Camera angle caps confidence: horizontal distances are foreshortened off side-on; vertical ones survive."""
    if side_on_off_deg is None or side_on_off_deg <= 20:
        return "clear" if severity >= 1.5 else "worth_checking"
    if RULES[fault_id]["horizontal"]:
        return "low"
    return "worth_checking" if severity >= 1.5 else "low"


def why_sentence(fault_id, values):
    hip, fwd, jump = (values.get(k) for k in ("hips_rise_early", "bar_forward_off_hips", "jump_forward"))
    hip_bad = hip is not None and hip >= RULES["hips_rise_early"]["threshold"]
    if fault_id == "hips_rise_early":
        tail = f", so the bar swung {fwd:.0f} cm forward off your hips" if fwd is not None and fwd >= RULES["bar_forward_off_hips"]["threshold"] else ""
        return f"Off the floor your hips rose {hip:.0f} cm more than your shoulders before the bar passed your knees{tail}."
    if fault_id == "bar_forward_off_hips":
        cause = f"it started off the floor, where your hips rose {hip:.0f} cm ahead of your shoulders and tipped you over the bar" if hip_bad else "the hips bumped it away instead of brushing it"
        return f"The bar swung {fwd:.0f} cm forward after your hips because {cause}."
    if fault_id == "jump_forward":
        if fwd is not None and fwd >= RULES["bar_forward_off_hips"]["threshold"]:
            cause = f"you chased a bar that swung {fwd:.0f} cm forward off your hips"
        elif hip_bad:
            cause = f"your hips rose {hip:.0f} cm ahead of your shoulders off the floor and pulled you over the bar"
        else:
            cause = "the bar drifted away from you in the pull"
        return f"Your feet landed {jump:.0f} cm forward because {cause}."
    raise ValueError(fault_id)
