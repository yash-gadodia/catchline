"""Outcome before faults (26-mistakes-misses.md sections 2.1, 8.1, 8.2): a miss gets its own card, and a forward bail
after a miss behind is not a "jump forward". Pure functions; distances in cm, x positive toward the lifter's front."""

BAIL_BEHIND = "To bail behind safely: keep the arms locked and jump forward."


def classify(made, bar_vs_midfoot_end, bar_vx_end):
    """make / missed_forward / missed_behind from where the bar was, and which way it moved, when it left the lifter."""
    if made:
        return "make"
    if bar_vs_midfoot_end < 0 and bar_vx_end <= 0:
        return "missed_behind"
    if bar_vs_midfoot_end >= 0:
        return "missed_forward"
    return "unknown"


def behind_cause(fwd_excursion, pvx_minus, hip_past_ankle, trunk_back, foot_dx, trunk_fwd_catch, max_hip, bar_behind):
    """Missed-behind causes in time order (26 section 8.2), the earliest that fires wins.
    fwd_excursion: bar forward after hip contact (cm); pvx_minus: peak backward bar speed after it (cm/s, negative);
    hip_past_ankle: hip x - ankle x at peak extension (cm); trunk_back: trunk past vertical at max bar height (deg);
    foot_dx: ankle shift lift-off to catch (cm); trunk_fwd_catch: trunk forward at the catch (deg); max_hip: largest
    hip angle in the pull (deg); bar_behind: how far the bar sat behind the shoulder line at max height (cm, >0 behind).
    Returns (cause, severity) with severity = how far past its band (>= 1), or ("position", s) / (None, 0)."""
    sev = []
    if fwd_excursion is not None and pvx_minus is not None and fwd_excursion > 10 and pvx_minus < -55:
        sev.append(("loop", min(fwd_excursion / 10, pvx_minus / -55)))
    hips = [x for x in (hip_past_ankle / 6 if hip_past_ankle is not None else None,
                        trunk_back / 10 if trunk_back is not None else None,
                        -foot_dx / 5 if foot_dx is not None else None) if x is not None and x > 1]
    if hips:
        sev.append(("hips", max(hips)))
    if trunk_fwd_catch is not None and max_hip is not None and trunk_fwd_catch > 20 and max_hip < 170:
        sev.append(("dive", min(trunk_fwd_catch / 20, 1 + (170 - max_hip) / 170)))
    if sev:
        return sev[0]
    if bar_behind is not None and bar_behind > 8:
        return "position", bar_behind / 8
    return None, 0.0


CAUSE_CUE = {"loop": "bar_forward_off_hips", "hips": "incomplete_extension", "dive": "incomplete_extension"}


def behind_copy(bar_behind_midfoot, cause, m):
    """26 section 8.5: outcome and number first, then the earliest cause (or an honest "can't tell"), then the bail line."""
    head = f"Missed behind. The bar finished {abs(bar_behind_midfoot):.0f} cm behind mid-foot."
    body = {
        "loop": f"Earliest thing I can see: the bar swung {m.get('fwd', 0):.0f} cm forward off your hips and came back fast, so it looped behind you.",
        "hips": f"Earliest thing I can see: {m.get('hips_text', 'your hips went forward through the bar at the top')}, so you went back under it.",
        "dive": f"Earliest thing I can see: your pull stopped short and your chest dropped {m.get('trunk', 0):.0f} deg forward to get under it.",
        "position": f"The bar sat {m.get('behind', 0):.0f} cm behind your shoulder line at the top; I can't see why from this clip.",
        None: "I can't tell why from this clip; film one more rep and I'll compare.",
    }[cause]
    return f"{head} {body} {BAIL_BEHIND}"
