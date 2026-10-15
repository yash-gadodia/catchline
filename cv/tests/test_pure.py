import numpy as np
import pytest

from catchline_cv import rules
from catchline_cv.geometry import angle, bar_from_wrists, lowpass, normalise, rise_ratio, trunk_angle
from catchline_cv.phases import SNATCH_PHASES, catch_depth, find_reps, segment_snatch


def test_angle_right_and_straight():
    assert angle((1, 0), (0, 0), (0, 1)) == pytest.approx(90.0)
    assert angle((-1, 0), (0, 0), (1, 0)) == pytest.approx(180.0)
    assert angle((1, 1), (0, 0), (1, 0)) == pytest.approx(45.0)


def test_angle_vectorised():
    a = np.array([[1, 0], [-1, 0]])
    b = np.zeros((2, 2))
    c = np.array([[0, 1], [1, 0]])
    assert angle(a, b, c) == pytest.approx([90.0, 180.0])


def test_trunk_angle_image_coords():
    assert trunk_angle((0, 0), (0, 10)) == pytest.approx(90.0)  # shoulder straight above hip
    assert trunk_angle((10, -10), (0, 0)) == pytest.approx(45.0)
    assert trunk_angle((-10, -10), (0, 0)) == pytest.approx(45.0)  # facing either way


def test_normalise_and_clamp():
    assert normalise((360, 640), 720, 1280) == {"x": 0.5, "y": 0.5}
    assert normalise((-5, 2000), 720, 1280) == {"x": 0.0, "y": 1.0}


def test_lowpass_keeps_slow_signal_and_fills_nans():
    t = np.arange(120) / 30
    x = np.sin(2 * np.pi * 0.5 * t)
    x[10] = np.nan
    y = lowpass(x, 30, 6.0)
    assert np.isfinite(y).all()
    assert np.max(np.abs(y[15:-15] - np.sin(2 * np.pi * 0.5 * t[15:-15]))) < 0.02


def synthetic_snatch(fps=30):
    """Bar height (cm) and knee angle for a squat snatch: rest, pull with a double knee bend, peak,
    a 15 cm drop into the catch, a ride down to the squat bottom, a stand-up higher than the peak."""
    h = np.concatenate([
        np.full(30, 22.0),                      # 0-29 on the floor
        np.linspace(22, 60, 12),                # 30-41 first pull
        np.linspace(61, 80, 6),                 # 42-47 transition
        np.linspace(82, 125, 8),                # 48-55 second pull
        np.linspace(126, 140, 6),               # 56-61 turnover
        np.linspace(139, 125, 6),               # 62-67 drop into catch
        np.linspace(124, 100, 30),              # 68-97 ride down
        np.linspace(101, 160, 30),              # 98-127 stand up
        np.full(20, 160.0),                     # 128-147 hold
    ])
    knee = np.concatenate([
        np.full(30, 60.0),
        np.linspace(60, 150, 12),               # extends to first max at 41
        np.linspace(148, 135, 6),               # re-bend to 47
        np.linspace(140, 178, 8),               # second extension max at 55
        np.linspace(170, 110, 6),
        np.linspace(105, 90, 6),
        np.linspace(90, 60, 30),
        np.linspace(62, 175, 30),
        np.full(20, 175.0),
    ])
    elbow = np.full(len(h), 100.0)
    elbow[64:] = 165.0
    return h, knee, elbow


def test_segment_snatch_synthetic_events():
    h, knee, elbow = synthetic_snatch()
    phases, ev = segment_snatch(h, knee, 30, elbow=elbow)
    assert ev["liftoff"] == 30
    assert ev["first_ext"] == 41
    assert ev["rebend"] == 47
    assert ev["second_ext"] == 55
    assert ev["peak"] == 61
    assert ev["caught"] == 64
    assert ev["catch_bottom"] == 97
    assert ev["double_knee_bend"] is True
    assert [p["name"] for p in phases] == SNATCH_PHASES
    assert phases[0] == {"name": "setup", "startFrame": 0, "endFrame": 29}
    assert phases[1] == {"name": "first_pull", "startFrame": 30, "endFrame": 41}
    assert phases[5] == {"name": "catch", "startFrame": 62, "endFrame": 97}
    for a, b in zip(phases, phases[1:]):
        assert b["startFrame"] == a["endFrame"] + 1


def test_segment_snatch_without_rebend_uses_knee_pass():
    h, knee, _ = synthetic_snatch()
    knee = np.maximum.accumulate(np.where(np.arange(len(knee)) < 56, knee, 0))  # no re-bend before the peak
    knee[56:] = 150
    _, ev = segment_snatch(h, knee, 30, knee_pass=38)
    assert ev["double_knee_bend"] is False
    assert ev["first_ext"] == 38


def test_find_reps_floor_to_overhead():
    n = 200
    wrist = np.full(n, 20.0)
    wrist[50:60] = np.linspace(20, 180, 10)
    wrist[60:120] = 180.0
    nose = np.full(n, 150.0)
    knee = np.full(n, 50.0)
    assert find_reps(wrist, nose, knee, 30) == [(51, 119, 58)]


def test_a_jump_behind_a_measured_bar_swing_cues_the_swing_even_under_its_threshold():
    # IMG_0226 (side-on squat snatch, missed forward): bar 5.2 cm forward off the hips, feet 8.6 cm forward
    miss = {"hips_rise_early": 7.82, "bar_forward_off_hips": 5.2, "jump_forward": 8.64}
    assert rules.fired(miss) == {"jump_forward": pytest.approx(1.728), "bar_forward_off_hips": pytest.approx(1.728)}
    assert rules.choose_cue(miss) == "bar_forward_off_hips"
    # prod 14 Oct side-on snatches: bar 5.7 / 5.9 cm, feet 6.5 / 6.1 cm
    assert rules.choose_cue({"hips_rise_early": -1.3, "bar_forward_off_hips": 5.7, "jump_forward": 6.5}) == "bar_forward_off_hips"
    assert rules.choose_cue({"hips_rise_early": -5.0, "bar_forward_off_hips": 5.9, "jump_forward": 6.1}) == "bar_forward_off_hips"
    # IMG_8149 (feet landed ~8 cm forward by eye, bar stayed close): the jump is its own fault
    assert rules.choose_cue({"hips_rise_early": -2.33, "bar_forward_off_hips": 4.56, "jump_forward": 8.56}) == "jump_forward"
    # E0DF8887 (made power snatch, feet ~3 cm forward by eye): nothing to cue
    assert rules.choose_cue({"hips_rise_early": -1.74, "bar_forward_off_hips": 3.59, "jump_forward": 3.99}) is None


def test_rules_gate_the_jump_behind_the_bar_swing_and_cap_confidence_off_side_on():
    vals = {"hips_rise_early": -3.0, "bar_forward_off_hips": 13.0, "jump_forward": 7.0}
    assert rules.fired(vals) == {"bar_forward_off_hips": pytest.approx(1.3), "jump_forward": pytest.approx(1.4)}
    # the jump is more severe, but the swing comes first and causes it (25 section 4 causal gating)
    assert rules.choose_cue(vals) == "bar_forward_off_hips"
    assert rules.choose_cue({"hips_rise_early": -3.0, "bar_forward_off_hips": 2.0, "jump_forward": 7.0}) == "jump_forward"
    assert rules.confidence("jump_forward", 1.4, 36.0) == "low"
    assert rules.confidence("hips_rise_early", 1.6, 36.0) == "worth_checking"
    assert rules.confidence("jump_forward", 1.6, 5.0) == "clear"
    assert rules.choose_cue({"hips_rise_early": 1.0, "bar_forward_off_hips": None, "jump_forward": 0.0}) is None
    assert len(rules.CUES["jump_forward"].split()) < 8
    assert rules.why_sentence("jump_forward", vals) == "Your feet landed 7 cm in front of where they started."
    assert rules.why_sentence("hips_rise_early", {"hips_rise_early": 9.0}, {"trunk_change": 13.4}) == (
        "Your back angle dropped 14 deg between the floor and the knee, which put the bar in front of you.")
    assert rules.why_sentence("early_arm_bend", {"early_arm_bend": 0.137}) == (
        "Your elbows bent 140 ms before your hips finished, so the bar lost leg speed.")


def synthetic_power_snatch(fps=30):
    """Power snatch: pull, peak, a small drop into a quarter-squat ride, stand up, hold, then the bar is lowered."""
    h = np.concatenate([
        np.full(30, 22.0),                      # 0-29 floor
        np.linspace(22, 140, 26),               # 30-55 pull
        np.linspace(141, 150, 6),               # 56-61 to the peak
        np.linspace(149, 135, 10),              # 62-71 ride down
        np.linspace(136, 160, 15),              # 72-86 stand
        np.full(30, 160.0),                     # 87-116 hold
        np.linspace(158, 30, 20),               # 117-136 lowered
    ])
    knee = np.concatenate([np.full(30, 60.0), np.linspace(60, 175, 26), np.full(6, 175.0),
                           np.linspace(170, 110, 10), np.linspace(115, 175, 15), np.full(50, 175.0)])
    elbow = np.full(len(h), 100.0)
    elbow[60:] = 165.0
    return h, knee, elbow


def test_segment_power_snatch_bottom_ignores_the_bar_being_lowered():
    h, knee, elbow = synthetic_power_snatch()
    phases, ev = segment_snatch(h, knee, 30, elbow=elbow)
    assert ev["peak"] == 61
    assert ev["caught"] == 61
    assert ev["catch_bottom"] == 71
    assert ev["recovered"] == 85
    assert ev["hold_end"] == 131
    assert [p["name"] for p in phases] == SNATCH_PHASES


def test_squat_snatch_bottom_and_hold_end():
    h, knee, elbow = synthetic_snatch()
    _, ev = segment_snatch(h, knee, 30, elbow=elbow)
    assert ev["catch_bottom"] == 97
    assert ev["hold_end"] == len(h)


def test_catch_depth_kind_from_knee_angle():
    hip = np.array([90.0, 70, 52, 55, 80])
    knee = np.array([50.0, 50, 50, 50, 50])
    f, depth, kind = catch_depth(hip, knee, np.array([170.0, 120, 55, 60, 150]), 0, 4)
    assert (f, depth, kind) == (2, -2.0, "squat")
    f, depth, kind = catch_depth(hip, knee, np.array([170.0, 120, 85, 90, 150]), 0, 4)
    assert (f, depth, kind) == (2, -2.0, "power")


def test_find_reps_keeps_one_rep_across_an_overhead_dip():
    n = 300
    wrist = np.full(n, 20.0)
    wrist[50:60] = np.linspace(20, 180, 10)
    wrist[60:120] = 180.0
    wrist[120:130] = 140.0                      # dips under the nose (catch or pose glitch), not to the knees
    wrist[130:200] = 180.0
    nose = np.full(n, 150.0)
    knee = np.full(n, 50.0)
    assert find_reps(wrist, nose, knee, 30) == [(51, 199, 58)]


def test_rise_ratio_is_the_depth_ratio_of_two_points_on_a_rigid_bar():
    plate = np.array([800.0, 780, 740, np.nan, 600])
    wrist = 500 + (plate - 800) * 0.8
    assert rise_ratio(plate, wrist) == pytest.approx(0.8)
    assert rise_ratio(np.full(5, 3.0), wrist) is None


def test_bar_from_wrists_drops_a_parked_wrist_by_continuity():
    lw = np.array([[100.0, 500], [100, 400], [100, 300], [100, 300]])
    rw = np.array([[104.0, 504], [104, 404], [104, 700], [104, 700]])  # far hand parked at the knee from frame 2
    out = bar_from_wrists(lw, rw, 80)
    assert out.tolist() == [[102.0, 502.0], [102.0, 402.0], [100.0, 300.0], [100.0, 300.0]]


def test_rep_confidence_needs_two_agreeing_reps_for_clear():
    assert rules.rep_confidence("clear", 1, 1) == "worth_checking"
    assert rules.rep_confidence("clear", 1, 2) == "worth_checking"
    assert rules.rep_confidence("clear", 2, 2) == "clear"
    assert rules.rep_confidence("low", 3, 3) == "low"


def test_refine_plate_ignores_shadow_and_finds_a_circle():
    import cv2
    from catchline_cv.track import refine_plate
    img = np.full((800, 600, 3), 200, np.uint8)
    cv2.circle(img, (300, 400), 100, (20, 20, 20), -1)                 # plate, 200 px
    cv2.rectangle(img, (285, 480), (315, 700), (20, 20, 20), -1)       # its floor shadow
    cv2.rectangle(img, (295, 380), (420, 405), (220, 220, 220), -1)    # bright sleeve notch
    coarse = {"centre": np.array([300.0, 440]), "axes": (300.0, 200.0), "score": 0.7, "side": "near"}
    r = refine_plate(img, coarse)
    assert r["centre"] == pytest.approx([300, 400], abs=3)
    assert r["axes"] == pytest.approx((200, 200), abs=4)



def _pull(n=24, jitter=4.0):
    plate = 800 - 1.2 * np.arange(n) ** 1.6  # accelerating rise, like the pull
    wrist = 600 + (plate - 800) * 0.85 + jitter * np.where(np.arange(n) % 2, 1, -1)  # +-4 px pose jitter
    return plate, wrist


def test_rise_ratio_does_not_move_with_the_lift_off_frame():
    plate, wrist = _pull()
    got = [round(rise_ratio(plate[s:], wrist[s:]), 4) for s in (0, 1, 2)]
    assert got == [0.8451, 0.8489, 0.8444]  # anchored at the first sample these read 0.8136, 0.8827, 0.8130


def _disc_frames(h, rise_px, n=12, start_y=0.75):
    import cv2
    frames = []
    for i in range(n):
        img = np.full((h, int(h * 0.5625), 3), 200, np.uint8)
        c = (int(round(h * 0.3 * 16)), int(round((start_y * h - i * rise_px) * 16)))
        cv2.circle(img, c, int(round(h * 0.08 * 16)), (20, 20, 20), -1, cv2.LINE_AA, 4)
        frames.append(img)
    return frames


def test_plate_track_is_not_quantised_and_gives_the_same_depth_ratio_at_1280_and_1080():
    from catchline_cv.track import track_plate
    ratios = {}
    for h in (1280, 1080):
        rise = 0.0059 * h  # 7.55 px/frame at 1280, between the coarse grid's 0.05-diameter (10.2 px) steps
        frames = _disc_frames(h, rise)
        plate = {"centre": np.array([0.3 * h, 0.75 * h]), "axes": (0.16 * h, 0.16 * h), "score": 0.9}
        c, _ = track_plate(frames, 0, plate)
        assert np.isfinite(c).all()
        assert np.abs(-np.diff(c[:, 1]) - rise).max() < 0.0012 * h  # 1.5 px at 1280; the coarse grid alone is off by up to 5
        wrist = 500 + (c[:, 1] - 0.75 * h) * 0.85
        ratios[h] = round(rise_ratio(c[:, 1], wrist), 4)
    assert ratios == {1280: 0.85, 1080: 0.85}
