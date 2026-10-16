import numpy as np
import pytest

from catchline_cv import rules
from catchline_cv.geometry import angle, bar_from_wrists, lowpass, normalise, rise_ratio, trunk_angle
from catchline_cv.phases import SNATCH_PHASES, catch_depth, find_reps, plate_liftoff, segment_snatch


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


def test_plate_liftoff_is_where_the_plate_starts_its_rise():
    # IMG_0226 (side-on, 288 px plate): the wrists rose 4-5 cm taking the slack out while the plate sat on the floor
    # (+-1.5 cm of track noise), then the plate rose ~1.2 cm a frame
    px = 288.0 / 45.0
    rise_cm = np.concatenate([[0.7, -0.7, 0.5, 0.8, -1.5, -1.3, -1.4, -1.3, -1.0, -1.4, -1.3, -1.4],
                              -1.3 + 1.2 * np.arange(1, 13)])
    y = 1000.0 - rise_cm * px
    assert plate_liftoff(y, 1, 288.0) == 11
    assert plate_liftoff(np.where(np.arange(len(y)) == 8, np.nan, y), 1, 288.0) is None
    assert plate_liftoff(np.full(30, 1000.0), 1, 288.0) is None
    assert plate_liftoff(y[:14], 1, 288.0) is None  # no rise before the end of the search (the second pull)


def test_power_snatch_received_without_a_dip_peaks_where_the_fast_rise_stops():
    # E0DF8887 (made power snatch, cm above lift-off every 2 frames from f74): the wrists rose fast to 127 cm by f100,
    # then crept up to 162 cm as the lifter stood; no 3% dip, so the peak fell back to the stand-up at f134
    h = np.interp(np.arange(0, 116), np.arange(0, 116, 2), [
        0.0, 5.0, 9.2, 9.6, 15.7, 31.2, 36.4, 42.6, 54.9, 68.1, 84.7, 107.4, 123.2, 127.3, 127.4, 131.0, 131.5,
        131.7, 133.3, 135.2, 138.7, 144.1, 149.6, 150.8, 155.3, 154.4, 155.3, 157.1, 159.0, 160.4, 161.8, 160.0,
        160.3, 161.4, 161.0, 160.4, 161.1, 159.7, 158.3, 157.5, 154.7, 148.2, 135.5, 117.2, 97.9, 81.7, 68.1, 62.7,
        62.0, 62.6, 62.9, 63.1, 64.6, 66.8, 68.4, 69.5, 69.6, 69.6])
    h = np.concatenate([np.zeros(30), h])
    knee = np.concatenate([np.full(30, 83.0), np.interp(np.arange(0, 116), [0, 10, 14, 20, 32, 50, 116],
                                                         [91, 138, 125, 167, 105, 168, 172])])
    elbow = np.full(len(h), 170.0)
    _, ev = segment_snatch(h, knee, 30, elbow=elbow)
    assert ev["liftoff"] == 30
    assert ev["peak"] == 55
    assert ev["caught"] == 55
    assert ev["recovered"] == 86  # f130: the bar back within 10% of its stand-up height


def test_a_squat_catch_at_the_top_of_the_bar_still_finds_its_bottom():
    # 21B27BAF (missed squat snatch): caught at the bar's highest point, rode down 0.9 s, then dumped it. With no
    # rise after the catch the ride-down is the catch, not a lowering after a stand-up
    h = np.concatenate([np.zeros(30), np.linspace(0, 127, 30), [127.0, 127.0, 127.0], np.linspace(127, 80, 27),
                        np.linspace(80, 30, 5), np.zeros(20)])
    knee = np.concatenate([np.full(30, 80.0), np.linspace(80, 170, 30), np.linspace(170, 60, 30), np.full(25, 60.0)])
    _, ev = segment_snatch(h, knee, 30, elbow=np.full(len(h), 170.0))
    assert ev["caught"] == 59
    assert ev["hold_end"] == 93
    assert ev["catch_bottom"] == 92


def test_segment_snatch_takes_a_given_liftoff():
    h, knee, elbow = synthetic_snatch()
    phases, ev = segment_snatch(h, knee, 30, elbow=elbow, liftoff=34)
    assert ev["liftoff"] == 34
    assert phases[1]["startFrame"] == 34
    assert ev["peak"] == 61


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
    assert rules.fired(miss) == {"jump_forward": pytest.approx(1.08), "bar_forward_off_hips": pytest.approx(1.08)}
    assert rules.choose_cue(miss) == "bar_forward_off_hips"
    # IMG_8149 (feet landed ~8 cm forward by eye, bar stayed close): the jump is its own fault
    assert rules.choose_cue({"hips_rise_early": -2.33, "bar_forward_off_hips": 4.56, "jump_forward": 8.56}) == "jump_forward"


def test_a_jump_inside_the_foot_noise_is_not_cued():
    # E0DF8887 (made power snatch, near heel back on its start line by eye) reads 5.3 cm (original) and 6.3 cm (app
    # transcode) at the landing; the threshold is the lenient 5 cm plus ~3 cm of foot-point noise
    assert rules.RULES["jump_forward"]["threshold"] == 8.0
    assert rules.choose_cue({"hips_rise_early": -1.7, "bar_forward_off_hips": 3.6, "jump_forward": 5.3}) is None
    assert rules.choose_cue({"hips_rise_early": -5.3, "bar_forward_off_hips": 3.7, "jump_forward": 6.3}) is None
    # prod 14 Oct side-on snatches (bar 5.7 / 5.9 cm, feet 6.5 / 6.1 cm): neither fault is past its threshold
    assert rules.choose_cue({"hips_rise_early": -1.3, "bar_forward_off_hips": 5.7, "jump_forward": 6.5}) is None
    assert rules.choose_cue({"hips_rise_early": -5.0, "bar_forward_off_hips": 5.9, "jump_forward": 6.1}) is None


def test_rules_gate_the_jump_behind_the_bar_swing_and_cap_confidence_off_side_on():
    vals = {"hips_rise_early": -3.0, "bar_forward_off_hips": 13.0, "jump_forward": 11.2}
    assert rules.fired(vals) == {"bar_forward_off_hips": pytest.approx(1.3), "jump_forward": pytest.approx(1.4)}
    # the jump is more severe, but the swing comes first and causes it (25 section 4 causal gating)
    assert rules.choose_cue(vals) == "bar_forward_off_hips"
    assert rules.choose_cue({"hips_rise_early": -3.0, "bar_forward_off_hips": 2.0, "jump_forward": 11.0}) == "jump_forward"
    assert rules.confidence("jump_forward", 1.4, 36.0) == "low"
    assert rules.confidence("hips_rise_early", 1.6, 36.0) == "worth_checking"
    assert rules.confidence("jump_forward", 1.6, 5.0) == "clear"
    assert rules.choose_cue({"hips_rise_early": 1.0, "bar_forward_off_hips": None, "jump_forward": 0.0}) is None
    assert len(rules.CUES["jump_forward"].split()) < 8
    assert rules.why_sentence("jump_forward", vals) == "Your feet landed 11 cm in front of where they started."
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


def test_notes_rank_the_other_faults_by_severity_gate_the_effect_and_drop_the_headline():
    det = {"trunk_change": 12.0}
    reps = [
        {"values": {"hips_rise_early": 12.0, "early_arm_bend": 0.2, "incomplete_extension": 10.0,
                    "bar_forward_off_hips": 25.0, "jump_forward": 9.0}, "detail": {}},
        {"values": {"hips_rise_early": 16.0, "early_arm_bend": None, "incomplete_extension": 4.0,
                    "bar_forward_off_hips": 13.0, "jump_forward": 2.0}, "detail": {"hips_rise_early": det}},
    ]
    cue_id, _ = rules.choose_set_cue("clean", [r["values"] for r in reps])
    assert cue_id == "bar_forward_off_hips"
    out = rules.notes("clean", reps, {"faultId": cue_id, "text": rules.CUES[cue_id]})
    # early_arm_bend is gated behind hips_rise_early, jump_forward behind bar_forward_off_hips
    assert out == [
        {"faultId": "hips_rise_early", "text": "Push the floor down, chest comes up.",
         "why": "Your back angle dropped 12 deg between the floor and the knee, which put the bar in front of you.",
         "severity": 2.0, "reps": 2},
        {"faultId": "incomplete_extension", "text": "Finish tall, then drop.",
         "why": "Your hips stopped 10 deg short of straight before you went under.", "severity": 1.25, "reps": 1},
    ]


def test_notes_keep_at_most_three_ties_to_the_earlier_fault_and_none_without_a_headline():
    reps = [{"values": {"forward_dip": 8.0, "press_out": 45.0, "chest_dive": 30.0, "bar_forward_overhead": 9.0}, "detail": {}}]
    assert rules.notes("jerk", reps, None) == []
    cue = {"faultId": "press_out", "text": rules.CUES["press_out"]}
    assert [n["faultId"] for n in rules.notes("jerk", reps, cue)] == ["forward_dip", "chest_dive", "bar_forward_overhead"]
    assert [n["faultId"] for n in rules.notes("jerk", reps, cue, limit=2)] == ["forward_dip", "chest_dive"]


def test_notes_for_gymnastics_put_repeating_faults_first_then_causal_order():
    reps = [{"values": {"leg_kip": 60.0, "early_arm_pull": 0.2, "no_push_away": 1.0}, "detail": {}},
            {"values": {"leg_kip": 40.0, "early_arm_pull": 0.2, "no_push_away": 1.0}, "detail": {}}]
    cue = {"faultId": "early_arm_pull", "text": rules.CUES["early_arm_pull"]}
    out = rules.notes("kipping_pull_up", reps, cue)
    assert [(n["faultId"], n["reps"]) for n in out] == [("no_push_away", 2), ("leg_kip", 1)]


def test_notes_drop_a_fault_whose_cue_is_already_the_headline_text():
    reps = [{"values": {"hips_rise_early": 12.0, "bar_forward_off_hips": 15.0}, "detail": {}}]
    cue = {"faultId": "missed_behind", "text": rules.CUES["hips_rise_early"]}
    assert [n["faultId"] for n in rules.notes("snatch", reps, cue)] == ["bar_forward_off_hips"]
