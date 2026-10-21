import numpy as np

from catchline_cv import rules
from catchline_cv.pipeline import arm_bend_value, cue_confidence, turnover_values

FPS = 30.0
LOCKED = np.full(200, 170.0)


def events(second_ext=40, peak=50, caught=None, rebend=34):
    return {"rebend": rebend, "second_ext": second_ext, "peak": peak, "caught": peak + 5 if caught is None else caught}


def test_a_turnover_over_its_threshold_fires_and_one_under_does_not():
    slow, _ = turnover_values(events(second_ext=40, peak=50, caught=58), LOCKED, 10.0, FPS)
    quick, _ = turnover_values(events(second_ext=40, peak=46, caught=52), LOCKED, 10.0, FPS)
    assert slow["slow_turnover"] == 18 / FPS
    assert quick["slow_turnover"] == 12 / FPS
    assert "slow_turnover" in rules.fired({"slow_turnover": slow["slow_turnover"]})
    assert rules.fired({"slow_turnover": quick["slow_turnover"]}) == {}


def test_a_bar_drop_over_25_cm_fires_and_one_under_does_not():
    big, det = turnover_values(events(), LOCKED, 30.0, FPS)
    small, _ = turnover_values(events(), LOCKED, 20.0, FPS)
    assert big["bar_crash"] == 30.0
    assert det["bar_crash"] == {"frame": 55, "from_frame": 50}
    assert rules.fired({"bar_crash": 30.0}) == {"bar_crash": 1.2}
    assert rules.fired({"bar_crash": small["bar_crash"]}) == {}


def test_implausibly_short_phases_measure_nothing():
    one_frame_turnover, _ = turnover_values(events(second_ext=49, peak=50, caught=70), LOCKED, 40.0, FPS)
    assert one_frame_turnover == {"slow_turnover": None, "bar_crash": None}
    one_frame_second_pull, _ = turnover_values(events(second_ext=40, rebend=39, peak=50, caught=70), LOCKED, 40.0, FPS)
    assert one_frame_second_pull == {"slow_turnover": None, "bar_crash": None}
    one_frame_catch, _ = turnover_values(events(second_ext=30, rebend=24, peak=50, caught=51), LOCKED, 40.0, FPS)
    assert one_frame_catch == {"slow_turnover": 21 / FPS, "bar_crash": None}


def test_no_elbow_lockout_or_a_turnover_over_a_second_measures_nothing():
    bent = np.full(200, 140.0)
    assert turnover_values(events(caught=70), bent, 40.0, FPS)[0] == {"slow_turnover": None, "bar_crash": None}
    too_long, _ = turnover_values(events(second_ext=40, peak=50, caught=75), LOCKED, 40.0, FPS)
    assert too_long == {"slow_turnover": None, "bar_crash": 40.0}


def test_early_arm_bend_needs_straight_arms_off_the_floor():
    assert arm_bend_value(0.2, brk=20, hip_full=26, lo=10) == 0.2
    assert rules.fired({"early_arm_bend": 0.2}) == {"early_arm_bend": 2.0}
    assert rules.fired({"early_arm_bend": 0.05}) == {}
    assert arm_bend_value(0.5, brk=12, hip_full=27, lo=10) is None
    assert arm_bend_value(0.0, brk=20, hip_full=12, lo=10) is None


def test_the_new_snatch_faults_rank_by_severity_then_lift_order():
    assert rules.choose_cue({"slow_turnover": 0.9, "bar_crash": 50.0, "jump_forward": 2.0}) == "slow_turnover"
    assert rules.choose_cue({"slow_turnover": 0.3, "bar_crash": 30.0}) == "bar_crash"
    assert rules.choose_cue({"early_arm_bend": 0.2, "slow_turnover": 0.9}) == "early_arm_bend"
    assert rules.RULES["early_arm_bend"]["order"] < rules.RULES["slow_turnover"]["order"] < rules.RULES["bar_crash"]["order"] < rules.RULES["jump_forward"]["order"]


def test_timing_and_drop_rules_hold_off_side_on_because_the_angle_only_shortens_them():
    for fid in ("early_arm_bend", "slow_turnover", "bar_crash"):
        assert rules.RULES[fid]["horizontal"] is False
        assert rules.confidence(fid, 1.1, 35.0) == "worth_checking"
        assert rules.confidence(fid, 1.1, 75.0) == "low"
    assert rules.confidence("jump_forward", 2.0, 35.0) == "low"


def test_the_new_snatch_cues_are_never_clear_and_a_time_needs_no_plate_scale():
    assert cue_confidence("slow_turnover", 3.0, 0.0, 3, 3, True) == "worth_checking"
    assert cue_confidence("bar_crash", 3.0, 0.0, 3, 3, True) == "worth_checking"
    assert cue_confidence("early_arm_bend", 3.0, 0.0, 3, 3, True) == "worth_checking"
    assert cue_confidence("bar_forward_off_hips", 3.0, 0.0, 3, 3, True) == "clear"
    assert cue_confidence("slow_turnover", 1.2, 0.0, 1, 1, False) == "worth_checking"
    assert cue_confidence("bar_crash", 1.2, 0.0, 1, 1, False) == "low"
