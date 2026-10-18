"""Partial results (42 Q4, the owner's call: always show the path, phases and speed; cue only when confident) and the
non-lift rejection behind the IMG_0074 regression."""
import os

import numpy as np
import pytest

from catchline_cv.phases import approaches_camera, plate_follows_bar
from catchline_cv.pipeline import ellipse_angles, not_a_lift, withhold


def meas():
    return [
        {"id": "hips_rise_early", "value": -9.0, "status": "normal", "note": "hips vs shoulders, floor to knee"},
        {"id": "bar_forward_off_hips", "value": 12.0, "status": "cue", "note": "after hip contact"},
        {"id": "jump_forward", "value": 9.1, "status": "follows", "note": "feet, lift-off to catch"},
        {"id": "bar_peak_height", "value": 120.0, "status": "normal", "note": "above lift-off (wrist midpoint)"},
    ]


def cue(fid, conf):
    return {"faultId": fid, "confidence": conf}


def test_a_confident_cue_is_kept():
    m = meas()
    assert withhold(cue("bar_forward_off_hips", "worth_checking"), {"off_side_deg": 34.3}, m) == (
        cue("bar_forward_off_hips", "worth_checking"), None)
    assert m == meas()
    assert withhold(None, {"off_side_deg": 50.0}, m) == (None, None)


def test_a_low_cue_filmed_off_side_on_is_held_back_and_the_horizontal_rows_are_not_judged():
    # IMG_0074 rep 1 (a made squat snatch at ~34 deg off side-on): bar 12 cm forward off the hips is foreshortened
    m = meas()
    assert withhold(cue("bar_forward_off_hips", "low"), {"off_side_deg": 34.3, "scale_ok": True}, m) == (
        None, {"code": "off_side_on", "offSideDeg": 34})
    assert [(x["id"], x["status"]) for x in m] == [("hips_rise_early", "normal"), ("bar_forward_off_hips", "not_seen"),
                                                    ("jump_forward", "not_seen"), ("bar_peak_height", "normal")]
    assert m[1]["note"] == "not judged: filmed ~34° off side-on"
    assert m[1]["value"] == 12.0


def test_a_low_cue_sized_from_the_body_says_the_plate_was_hidden():
    m = meas()
    assert withhold(cue("bar_forward_off_hips", "low"), {"off_side_deg": 8.0, "scale_ok": False}, m) == (
        None, {"code": "plate_hidden"})
    assert [x["status"] for x in m] == ["normal", "follows", "follows", "normal"]


def test_a_vertical_fault_off_side_on_is_not_blamed_on_the_angle():
    m = meas()
    assert withhold(cue("hips_rise_early", "low"), {"off_side_deg": 30.0, "scale_ok": True}, m) == (
        None, {"code": "low_confidence"})


def test_a_miss_with_no_measured_cause_is_an_unclear_miss_and_its_outcome_row_stops_being_the_cue():
    # 21B27BAF (squat snatch dropped forward, side-on): "I can't tell why from this clip" was a low cue
    m = meas() + [{"id": "outcome", "value": 14.0, "status": "cue", "note": "bar vs mid-foot when it left you"}]
    assert withhold(cue("missed_forward", "low"), {"off_side_deg": 9.0, "scale_ok": True}, m) == (
        None, {"code": "unclear_miss"})
    assert m[-1]["status"] == "normal"


def test_a_cue_on_a_rep_the_clip_cut_off_is_held_back_even_when_confident():
    m = meas()
    assert withhold(cue("jump_forward", "clear"), {"off_side_deg": 5.0, "scale_ok": True, "cut_off": True}, m) == (
        None, {"code": "rep_cut_off"})


def rise(n, start, top, frames):
    """Image y (down positive) of something that sits at `start` px and rises `top` px over `frames` frames."""
    y = np.full(n, float(start))
    y[10: 10 + frames] = start - np.linspace(0, top, frames)
    y[10 + frames:] = start - top
    return y


def test_the_plate_rises_with_the_hands_in_a_lift():
    # IMG_0074 rep 1: hands rose 582 px from lift-off to the peak, the near plate (168 px) 546
    assert plate_follows_bar(rise(60, 900, 546, 35), rise(60, 860, 582, 35), 10, 45, 168.0) is True


def test_a_plate_lost_early_in_the_pull_while_lagging_the_wrists_still_counts():
    # 21B27BAF app transcode: the track ends 12 frames after lift-off, the plate up 71 px against the hands' 178
    hands = rise(60, 860, 178, 12)
    plate = rise(60, 900, 71.4, 12)
    plate[23:] = np.nan
    assert plate_follows_bar(plate, hands, 10, 35, 264.4) is True


def test_hands_overhead_with_the_plate_left_on_the_floor_is_not_a_lift():
    # IMG_0074 "rep 2" (frames 1033-1240): the lifter stood behind the bar fixing his cap. Hands rose 353 px, the
    # near plate (250 px) 23
    assert plate_follows_bar(rise(80, 900, 23, 63), rise(80, 700, 353, 63), 10, 73, 249.6) is False


def test_no_verdict_without_a_plate_at_lift_off_or_before_the_hands_rise():
    hands = rise(60, 860, 582, 35)
    lost = rise(60, 900, 546, 35)
    lost[10] = np.nan
    assert plate_follows_bar(lost, hands, 10, 45, 168.0) is None
    early = rise(60, 900, 0, 35)
    early[14:] = np.nan  # tracked 4 frames, while the hands rose 51 px (< half a plate)
    assert plate_follows_bar(early, hands, 10, 45, 168.0) is None


def test_walking_up_to_the_camera_is_not_a_lift():
    # IMG_0074 "rep 4" (frames 2300-2342): the lifter walks to the phone; shin 212 px at "lift-off", 625 at the "peak".
    # Its real snatches hold 189-190 px from lift-off to the peak.
    walk = np.full(60, 211.6)
    walk[10:42] = np.linspace(211.6, 625.2, 32)
    walk[42:] = 625.2
    assert approaches_camera(walk, 10, 42) is True
    lift = np.full(60, 188.6)
    lift[40:] = 190.3
    assert approaches_camera(lift, 10, 42) is False
    assert approaches_camera(np.full(60, np.nan), 10, 42) is False


CLIP_DIRS = [d for d in os.environ.get("CATCHLINE_CLIPS", "").split(":") if d]
CACHE = os.environ.get("CATCHLINE_POSE_CACHE")


@pytest.mark.skipif(not (CLIP_DIRS and CACHE), reason="set CATCHLINE_CLIPS (dirs, ':'-separated) and CATCHLINE_POSE_CACHE")
def test_img_0074_counts_its_two_snatches_not_the_cap_fix_or_the_walk_to_the_phone(tmp_path):
    # the owner's 81 s clip: four "reps" since 4e9741f, the last (walking up to pick up the phone) a low-confidence
    # "missed forward" headline. Its two real snatches read ~34 and ~46 deg off side-on, so no cue.
    from catchline_cv import pipeline

    path = next((os.path.join(d, "IMG_0074.MOV") for d in CLIP_DIRS if os.path.exists(os.path.join(d, "IMG_0074.MOV"))),
                None)
    if path is None:
        pytest.skip("IMG_0074.MOV not on this machine")
    os.makedirs(tmp_path / "debug")
    res = pipeline.run(path, str(tmp_path / "a.json"), str(tmp_path / "kf"), "kf", str(tmp_path / "debug"), CACHE, "x",
                       "snatch")
    a = res if isinstance(res, dict) else res[0]
    assert [(r["startFrame"], r["endFrame"], r["made"]) for r in a["reps"]] == [(678, 841, True), (2005, 2168, True)]
    assert (a["cue"], a["noCueReason"], a["failure"]) == (None, {"code": "off_side_on", "offSideDeg": 46}, None)


def near(refined, diameter=207.5):
    return {"refined": refined, "diameter_px": diameter}


SHIN = np.full(120, 134.0)


def test_a_coarse_plate_that_never_moves_does_not_veto_a_real_snatch():
    # e4fe6d08 (owner's snatch, phone pose, ~70 deg off side-on): the near "plate" was floor clutter none of whose 3
    # setup fits refined. It rose 76 px while the hands rose 449 px from lift-off (52) to the peak (89): 0.17 < 0.25
    hands = rise(120, 828, 449, 37)
    clutter = rise(120, 808, 76, 37)
    assert plate_follows_bar(clutter, hands, 10, 47, 207.5) is False
    assert not_a_lift(near(False), clutter, hands, SHIN, 10, 47) is False


def test_a_refined_plate_left_on_the_floor_still_vetoes():
    # IMG_0074 cap fix: 4 of 9 setup fits refined, the plate rose 0.07 of the hands
    assert not_a_lift(near(True, 249.6), rise(80, 900, 23, 63), rise(80, 700, 353, 63), SHIN[:80], 10, 73) is True


def test_a_rep_whose_bar_never_rose_from_lift_off_is_not_a_lift():
    # 1fec9d79 "rep 1": the lifter at the phone, keypoint scores 0.04-0.16, segmented with lift-off = peak = 0
    flat = np.full(101, 700.0)
    assert not_a_lift(near(False, 1491.4), flat, flat, np.full(101, 178.8), 0, 0) is True


def test_a_plate_angle_comes_only_from_plates_with_a_refined_fit():
    # eed83127: near plate 1 of 7 fits refined (median 252.1 x 126.0, the coarse grid's 0.5 floor = 60 deg), far plate
    # 7 of 7 (143.8 x 114.8 = 37 deg). e4fe6d08's seed "plate", 207.5 x 207.5 and never refined, would read 0 deg
    plates = [{"axes": (252.1, 126.0), "refined": True}, {"axes": (143.8, 114.8), "refined": True},
              {"axes": (207.5, 207.5), "refined": False}]
    assert [round(a, 1) for a in ellipse_angles(plates)] == [60.0, 37.0]
    assert ellipse_angles(plates[2:]) == []


def test_a_snatch_whose_bar_never_clears_the_shoulders_lost_the_bar_and_is_never_clean():
    # IMG_7428 (18 Oct): the hands were lost overhead, the "peak" sat at chest height and every row read normal
    m = meas()
    assert withhold(None, {"bar_lost": True}, m) == (None, {"code": "bar_lost"})
    assert withhold(cue("bar_forward_off_hips", "worth_checking"), {"bar_lost": True}, m) == (None, {"code": "bar_lost"})
    assert "cue" not in [x["status"] for x in m]
