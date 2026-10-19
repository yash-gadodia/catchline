import numpy as np
import pytest

from catchline_cv import gym, movement, rules
from catchline_cv.phases import JERK_PHASES, SNATCH_PHASES, find_jerk_reps, find_rack_reps, segment_jerk, segment_snatch
from catchline_cv.pose import HEAD, merge_passes, strip_head, unrotate

FPS = 30


# ---------------------------------------------------------------- privacy

def person(x, y, h=400.0, score=0.9):
    """A standing person: 26 Halpe points around (x, y = feet), h px tall, image coords."""
    k = np.zeros((26, 2))
    rows = {0: 0.06, 1: 0.05, 2: 0.05, 3: 0.06, 4: 0.06, 17: 0.0, 18: 0.15, 5: 0.18, 6: 0.18, 7: 0.33, 8: 0.33,
            9: 0.47, 10: 0.47, 11: 0.5, 12: 0.5, 19: 0.5, 13: 0.73, 14: 0.73, 15: 0.96, 16: 0.96,
            20: 1.0, 21: 1.0, 22: 1.0, 23: 1.0, 24: 0.98, 25: 0.98}
    for j, r in rows.items():
        k[j] = (x + (-0.08 if j % 2 else 0.08) * h * (j not in (0, 17, 18, 19)), y - h + r * h)
    box = np.array([x - 0.15 * h, y - h, x + 0.15 * h, y])
    return box, k, np.full(26, score)


def test_strip_head_drops_face_points_and_keeps_the_body():
    b, k, s = person(300, 900)
    out = strip_head([[(b, k, s)]])
    k2, s2 = out[0][0][1], out[0][0][2]
    assert np.isnan(k2[list(HEAD)]).all()
    assert (s2[list(HEAD)] == 0).all()
    body = [j for j in range(26) if j not in HEAD]
    assert np.array_equal(k2[body], k[body])
    assert np.isfinite(k[0]).all()  # the input is not modified


def test_unrotate_maps_a_rotated_detection_back_without_swapping_sides():
    b, k, s = person(300, 900)
    shape = (1280, 720, 3)
    rot_k = np.stack([720 - k[:, 0], 1280 - k[:, 1]], 1)
    rot_b = np.array([720 - b[2], 1280 - b[3], 720 - b[0], 1280 - b[1]])
    (b2, k2, _), = unrotate([(rot_b, rot_k, s)], shape)
    assert np.allclose(k2, k)
    assert np.allclose(b2, b)


def test_merge_passes_keeps_the_more_confident_pose_per_person():
    b, k, _ = person(300, 900)
    upright = [(b, k, np.full(26, 0.3))]
    rotated = [(b + 2, k + 1, np.full(26, 0.8)), (b + 400, k + 400, np.full(26, 0.6))]
    out = merge_passes(upright, rotated)
    assert len(out) == 2
    assert out[0][2][0] == pytest.approx(0.8)
    assert out[1][0][0] == pytest.approx(b[0] + 400)


# ---------------------------------------------------------------- movement check

def body_seq(n, sho_y, hip_y, wri_y, knee_y=None, ank_y=None, x=360.0, wri_x=None):
    """(n, 26, 2) lifter keypoints from per-frame heights (image px, y down). Side-on: left and right overlap."""
    k = np.full((n, 26, 2), np.nan)
    sho_y, hip_y, wri_y = (np.broadcast_to(np.asarray(v, float), (n,)) for v in (sho_y, hip_y, wri_y))
    knee_y = (hip_y + 0.6 * (hip_y - sho_y)) if knee_y is None else np.broadcast_to(np.asarray(knee_y, float), (n,))
    ank_y = (knee_y + 0.6 * (hip_y - sho_y)) if ank_y is None else np.broadcast_to(np.asarray(ank_y, float), (n,))
    wri_x = x if wri_x is None else wri_x
    for a, b, y, xx in ((5, 6, sho_y, x), (11, 12, hip_y, x), (13, 14, knee_y, x + 10), (15, 16, ank_y, x),
                        (9, 10, wri_y, wri_x), (7, 8, (sho_y + wri_y) / 2, x + 15)):
        k[:, a] = np.stack([np.broadcast_to(xx, (n,)), y], 1)
        k[:, b] = k[:, a]
    k[:, [20, 21]] = k[:, [15, 16]] + [20, 0]
    k[:, [24, 25]] = k[:, [15, 16]] - [5, 0]
    return k


def snatch_like(n=120):
    t = np.arange(n)
    wri = np.where(t < 40, 900.0, np.where(t < 60, 900 - (t - 40) * 30, 300.0))
    return body_seq(n, 500.0, 700.0, wri, knee_y=850.0, ank_y=1000.0)


def pull_up_like(n=150):
    t = np.arange(n)
    sho = 400 + 120 * (0.5 + 0.5 * np.cos(2 * np.pi * t / 50))
    return body_seq(n, sho, sho + 200, 250.0)


def handstand_like(n=90):
    return body_seq(n, 900.0, 700.0, 1050.0, knee_y=550.0, ank_y=400.0)


def test_movement_family_from_body_signals():
    assert movement.family(movement.signals(snatch_like(), FPS)) == "barbell"
    assert movement.family(movement.signals(pull_up_like(), FPS)) == "hanging"
    assert movement.family(movement.signals(handstand_like(), FPS)) == "inverted"


def test_check_rejects_a_snatch_tagged_as_a_pull_up_and_accepts_the_match():
    sig = movement.signals(snatch_like(), FPS)
    ok, msg = movement.check("kipping_pull_up", sig)
    assert not ok
    assert msg == "This clip looks like a barbell lift, not a kipping pull-up. Pick the movement you filmed and try again."
    assert movement.check("snatch", sig) == (True, None)
    assert movement.check("clean", sig) == (True, None)
    assert movement.check("bar_muscle_up", movement.signals(pull_up_like(), FPS)) == (True, None)
    assert movement.check("snatch", movement.signals(pull_up_like(), FPS))[0] is False
    assert movement.check("kipping_hspu", movement.signals(handstand_like(), FPS)) == (True, None)
    assert movement.check("ring_muscle_up", sig) == (False, "ring muscle up analysis is not available.")


def test_a_kip_filmed_off_side_on_with_drifting_hands_is_still_hanging():
    # #29: 30-45 deg off side-on, tracking and camera drift move the "fixed" hands about as far as the feet, so the
    # feet-vs-hands test fails and the chin-at-the-bar frames read as a barbell at the shoulders
    n = 390
    t = np.arange(n)
    sho = 300 + 240 * (0.5 + 0.5 * np.cos(2 * np.pi * t / 50))
    wri = 250 + 60 * np.sin(2 * np.pi * t / n)
    k = body_seq(n, sho, sho + 200, wri, wri_x=360 + 300 * t / n)
    assert movement.check("kipping_pull_up", movement.signals(k, FPS)) == (True, None)
    assert movement.family(movement.signals(k, FPS)) == "hanging"


def test_hands_overhead_moving_with_the_body_are_not_hanging():
    n = 300  # an overhead-squat-like clip: bar overhead the whole time, the hands ride up and down with the shoulders
    t = np.arange(n)
    sho = 500 + 200 * (0.5 + 0.5 * np.cos(2 * np.pi * t / 90))
    sig = movement.signals(body_seq(n, sho, sho + 200, sho - 250), FPS)
    assert sig["overhead_s"] * FPS >= 0.75 * n
    assert sig["hanging"] is False


def test_a_second_of_upside_down_pose_in_a_long_snatch_clip_is_not_a_handstand():
    k = np.concatenate([snatch_like(120)] * 8)  # 32 s
    k[300:345] = handstand_like(45)  # 1.5 s of flipped pose
    assert movement.family(movement.signals(k, FPS)) == "barbell"
    assert movement.family(movement.signals(handstand_like(), FPS)) == "inverted"


def test_check_lets_an_unclear_clip_through_to_the_analysis():
    still = body_seq(90, 500.0, 700.0, 690.0, knee_y=850.0, ank_y=1000.0)  # standing, hands at the hips
    sig = movement.signals(still, FPS)
    assert movement.family(sig) is None
    assert movement.check("jerk", sig) == (True, None)


def test_head_stand_in_sits_just_beyond_the_shoulders_either_way_up():
    up = body_seq(3, 500.0, 700.0, 800.0)
    assert movement.head_y(up) == pytest.approx([460.0, 460.0, 460.0])
    inv = body_seq(3, 900.0, 700.0, 1050.0)
    assert movement.head_y(inv) == pytest.approx([940.0, 940.0, 940.0])


# ---------------------------------------------------------------- clean and jerk phases

def synthetic_clean():
    """Bar height (cm), knee angle and a front-rack mask for a power clean: pull, peak at the chest, the bar dips a
    little into the rack, the lifter rides down and stands up with it at the shoulders."""
    h = np.concatenate([np.full(30, 22.0), np.linspace(22, 60, 12), np.linspace(61, 80, 6), np.linspace(82, 120, 8),
                        np.linspace(121, 128, 4),            # 56-59 peak at 59
                        np.linspace(126, 118, 6),            # 60-65 drop into the rack
                        np.linspace(117, 105, 15),           # 66-80 ride down
                        np.linspace(106, 140, 20),           # 81-100 stand up
                        np.full(20, 140.0)])
    knee = np.concatenate([np.full(30, 60.0), np.linspace(60, 150, 12), np.linspace(148, 135, 6), np.linspace(140, 178, 8),
                           np.full(4, 175.0), np.linspace(170, 120, 6), np.linspace(118, 100, 15), np.linspace(102, 175, 20),
                           np.full(20, 175.0)])
    rack = np.zeros(len(h), bool)
    rack[62:] = True
    return h, knee, rack


def test_segment_clean_catches_in_the_front_rack():
    h, knee, rack = synthetic_clean()
    phases, ev = segment_snatch(h, knee, FPS, elbow=np.full(len(h), 170.0), catch_mask=rack)
    assert [p["name"] for p in phases] == SNATCH_PHASES
    assert ev["liftoff"] == 30
    assert ev["peak"] == 59
    assert ev["caught"] == 62   # first rack frame, not the straight elbows the snatch would use
    assert ev["catch_bottom"] == 80
    assert ev["double_knee_bend"] is True


def test_find_rack_reps_needs_floor_then_a_held_rack():
    n = 200
    wrist = np.full(n, 30.0)
    wrist[40:60] = np.linspace(30, 140, 20)
    wrist[60:120] = 140.0
    knee = np.full(n, 50.0)
    rack = np.zeros(n, bool)
    rack[62:120] = True
    rack[150:153] = True       # a flicker, too short to count
    assert find_rack_reps(wrist, knee, rack, FPS) == [(43, 119, 62)]  # last frame below the knees


def test_find_jerk_reps_pairs_a_shoulder_hold_with_the_next_overhead_hold():
    n = 220
    at_sho = np.zeros(n, bool)
    over = np.zeros(n, bool)
    at_sho[10:60] = True
    over[75:110] = True
    over[180:200] = True        # overhead with no rack before it (a snatch): not a jerk
    assert find_jerk_reps(at_sho, over, FPS) == [(10, 109, 75)]


def test_find_jerk_reps_pairs_a_shoulder_hold_that_runs_straight_into_the_overhead_hold():
    # 2c7d6090 / 45a85340 (19 Oct): the drive takes the wrists from the shoulder band to over the head with no frame
    # in neither, so the shoulder run ends on (or one past) the overhead run's first frame. Both were "no jerk found"
    n = 330
    at_sho = np.zeros(n, bool)
    over = np.zeros(n, bool)
    at_sho[31:263] = True
    over[262:323] = True
    assert find_jerk_reps(at_sho, over, FPS) == [(31, 322, 262)]
    at_sho[:] = False
    over[:] = False
    at_sho[0:37] = True
    over[35:96] = True
    assert find_jerk_reps(at_sho, over, FPS) == [(0, 95, 35)]


def synthetic_jerk():
    """Bar height (cm) from the rack: hold, dip 10 cm, drive to overhead, land in the split, recover."""
    h = np.concatenate([np.full(30, 150.0), np.linspace(149, 140, 8), np.linspace(141, 175, 6), np.linspace(180, 205, 6),
                        np.linspace(204, 200, 6), np.linspace(201, 215, 15), np.full(20, 215.0)])
    knee = np.concatenate([np.full(30, 175.0), np.linspace(172, 150, 8), np.linspace(152, 178, 6), np.linspace(170, 120, 6),
                           np.linspace(121, 125, 6), np.linspace(128, 175, 15), np.full(20, 175.0)])
    elbow = np.concatenate([np.full(44, 60.0), np.linspace(80, 150, 6), np.linspace(152, 170, 6), np.full(35, 172.0)])
    return h, knee, elbow


def test_segment_jerk_events_and_phases():
    h, knee, elbow = synthetic_jerk()
    phases, ev = segment_jerk(h, knee, elbow, FPS)
    assert [p["name"] for p in phases] == JERK_PHASES
    assert ev["dip_start"] == 29   # last still frame in the rack
    assert ev["dip_bottom"] == 37
    assert ev["leave"] == 40
    assert ev["land"] == 49
    assert ev["catch_bottom"] == 55
    assert ev["recovered"] == 69
    for a, b in zip(phases, phases[1:]):
        assert b["startFrame"] == a["endFrame"] + 1


# ---------------------------------------------------------------- gymnastics signals

def test_shoulders_at_the_top_edge_mean_the_top_of_the_rep_is_cut_off():
    # BD1AE773 (banded pull-ups, bar above a 1280 px frame): the pose put the shoulders as high as y -36 px on the
    # original and 8 px on the app's transcode, scores ~0.45; A1F2F738 (bar in view): shoulders 336..497 px
    original = body_seq(60, np.linspace(89.0, -36.0, 60), 330.0, 200.0)
    transcode = body_seq(60, np.linspace(87.0, 8.0, 60), 330.0, 200.0)
    seen = body_seq(60, np.linspace(497.0, 336.0, 60), 700.0, 250.0)
    assert gym.shoulders_cut_off(original, 10, 50, 1280) is True
    assert gym.shoulders_cut_off(transcode, 0, 59, 1280) is True
    assert gym.shoulders_cut_off(original, 0, 20, 1280) is False
    assert gym.shoulders_cut_off(seen, 0, 59, 1280) is False


def test_cycle_tops_finds_each_rep_and_its_valleys():
    t = np.arange(150)
    h = -np.cos(2 * np.pi * t / 50)          # tops at 25, 75, 125
    reps = gym.cycle_tops(h, 1.0, FPS, prominence=0.5)
    assert [r[1] for r in reps] == [25, 75, 125]
    assert reps[1] == (50, 75, 100)


def kip(break_at, n=40):
    """Legs behind (arch) to 10, in front (hollow) after; hip angle tightest at 20 then opening fastest at 26."""
    legs = np.where(np.arange(n) < 10, -1.0, 1.0)
    hip = np.concatenate([np.full(10, 175.0), np.linspace(170, 120, 11), np.array([125, 132, 141, 152, 165, 172]),
                          np.full(n - 27, 175.0)])
    elbow = np.where(np.arange(n) >= break_at, 120.0, 175.0)
    return legs, hip, elbow


def test_kip_events_and_the_early_arm_pull_interval():
    legs, hip, elbow = kip(break_at=22)
    ev = gym.kip_events(legs, hip, elbow, 0, 35)
    assert (ev["arch_start"], ev["hollow_start"], ev["hip_tight"]) == (0, 10, 20)
    assert ev["hip_open"] == 24
    assert ev["elbow_break"] == 22
    assert (ev["hip_open"] - ev["elbow_break"]) / FPS == pytest.approx(0.0667, abs=1e-3)   # < 0.13 s: not flagged
    legs, hip, elbow = kip(break_at=18)
    ev = gym.kip_events(legs, hip, elbow, 0, 35)
    assert (ev["hip_open"] - ev["elbow_break"]) / FPS == pytest.approx(0.2)
    phases = gym.kip_phases(ev, 39)
    assert [p["name"] for p in phases] == gym.KIP_PHASES
    assert phases[0] == {"name": "arch", "startFrame": 0, "endFrame": 9}


def test_push_away_measures_the_shoulders_moving_back_off_the_bar():
    x = np.concatenate([np.linspace(0, 10, 20), np.linspace(10, 3, 12), np.full(10, 3.0)])
    assert gym.push_away(x, 19, FPS) == pytest.approx(7.0)
    assert gym.push_away(np.full(40, 5.0), 19, FPS) == 0.0


def test_bmu_events_cross_support_lockout():
    n = 60
    kipev = {"arch_start": 0, "hollow_start": 5, "hip_tight": 10, "hip_open": 12, "elbow_break": 14, "top": 40}
    el_l = np.concatenate([np.linspace(-60, 5, 30), np.full(30, 5.0)])   # crosses the bar (0) at frame 27
    el_r = el_l - 3
    sho = np.concatenate([np.linspace(-50, 0, 30), np.linspace(0, 30, 10), np.full(20, 30.0)])
    elbow = np.concatenate([np.full(40, 90.0), np.linspace(90, 170, 10), np.full(10, 170.0)])
    ev = gym.bmu_events(kipev, el_l, el_r, sho, elbow, 0.0, 50.0, n - 1)
    assert ev["cross"] == 27
    assert ev["support"] == 32          # shoulders 5 above the bar (0.1 x 50)
    assert ev["lockout"] == 48
    assert [p["name"] for p in gym.bmu_phases(ev, n - 1)] == gym.BMU_PHASES


def test_hspu_events_and_timing_error():
    n = 61
    t = np.arange(n)
    sho = 20 * np.cos(2 * np.pi * t / 60)           # tops at 0 and 60, bottom at 30
    hip = np.where((t > 20) & (t < 40), 80.0, 170.0)
    hip[28] = 70.0                                   # tightest tuck
    knee = np.concatenate([np.full(32, 60.0), np.linspace(60, 175, 6), np.full(23, 175.0)])   # drive at ~33-36
    elbow = np.concatenate([np.full(36, 70.0), np.linspace(70, 170, 6), np.full(19, 170.0)])  # press at ~37-40
    ev = gym.hspu_events(sho, hip, knee, elbow, 0, 60, FPS)
    assert ev["bottom"] == 30
    assert ev["tuck"] == 28
    assert ev["drive"] == 33
    assert ev["press"] == 37
    assert ev["lockout"] == 41
    assert gym.timing_error(ev["drive"], ev["press"], FPS) == 0.0
    assert gym.timing_error(40, 34, FPS) == pytest.approx(0.2)         # pressed before the kick
    assert gym.timing_error(30, 42, FPS) == pytest.approx(0.15)        # pressed after the drive faded
    assert [p["name"] for p in gym.hspu_phases(ev)] == gym.HSPU_PHASES


def test_chord_offset_sign_follows_the_away_direction():
    sho, ank = (0.0, 100.0), (0.0, -100.0)
    assert gym.chord_offset(sho, (8.0, 0.0), ank, 1.0) == pytest.approx(8.0)
    assert gym.chord_offset(sho, (8.0, 0.0), ank, -1.0) == pytest.approx(-8.0)


# ---------------------------------------------------------------- rules

def test_every_movement_fault_has_a_rule_a_short_cue_and_a_why():
    for faults in rules.FAULTS.values():
        for f in faults:
            assert f in rules.RULES and len(rules.CUES[f].split()) <= 8  # S1 in the library is 8 words
            vals = {x: rules.RULES[x]["threshold"] * (0.5 if rules.RULES[x].get("below") else 2.0) for x in faults}
            assert rules.why_sentence(f, vals).endswith(".")


def test_below_rule_fires_under_its_threshold():
    assert rules.fired({"no_push_away": 1.0}) == {"no_push_away": pytest.approx(1.75)}
    assert rules.fired({"no_push_away": 6.0}) == {}


def test_set_cue_gymnastics_takes_the_earliest_repeated_fault_in_the_chain():
    reps = [{"leg_kip": 30.0, "early_arm_pull": 0.3, "no_push_away": 1.0},
            {"leg_kip": 60.0, "early_arm_pull": 0.2, "no_push_away": 2.0},
            {"leg_kip": 20.0, "early_arm_pull": 0.0, "no_push_away": None}]
    # leg_kip fires once (rep 2), early_arm_pull on 2 reps: the repeated one wins even though leg_kip is earlier
    assert rules.choose_set_cue("kipping_pull_up", reps) == ("early_arm_pull", 2)
    reps[0]["leg_kip"] = 55.0
    assert rules.choose_set_cue("kipping_pull_up", reps) == ("leg_kip", 2)
    assert rules.choose_set_cue("bar_muscle_up", [{"bmu_early_pull": 10.0}]) == (None, 0)


def test_set_cue_barbell_takes_the_most_severe():
    reps = [{"forward_dip": 5.0, "press_out": 40.0}, {"forward_dip": 6.0, "press_out": 0.0}]
    assert rules.choose_set_cue("jerk", reps) == ("press_out", 1)


def test_clear_needs_two_reps_and_side_on():
    assert rules.rep_confidence(rules.confidence("chicken_wing", 2.0, 10.0), 1, 1) == "worth_checking"
    assert rules.rep_confidence(rules.confidence("chicken_wing", 2.0, 10.0), 2, 2) == "clear"
    assert rules.confidence("press_out", 2.0, 40.0) == "low"


# ---------------------------------------------------------------- outcomes (26) and cue copy (25)

from catchline_cv import outcome  # noqa: E402


def test_outcome_classifier_reads_where_the_bar_left():
    assert outcome.classify(True, -20.0, -5.0) == "make"
    assert outcome.classify(False, -9.0, -3.0) == "missed_behind"
    assert outcome.classify(False, 6.0, 2.0) == "missed_forward"
    assert outcome.classify(False, -4.0, 3.0) == "unknown"   # behind but coming back forward


def test_missed_behind_reports_the_earliest_cause():
    # loop needs both the forward swing and a fast return
    assert outcome.behind_cause(14.0, -70.0, 8.0, 0.0, 0.0, 0.0, 175.0, 10.0) == ("loop", pytest.approx(1.27, abs=0.01))
    assert outcome.behind_cause(14.0, -40.0, 9.0, 0.0, 0.0, 0.0, 175.0, 10.0) == ("hips", pytest.approx(1.5))
    assert outcome.behind_cause(4.0, -40.0, 0.0, 12.0, 0.0, 0.0, 175.0, 10.0) == ("hips", pytest.approx(1.2))
    assert outcome.behind_cause(4.0, -40.0, 0.0, 0.0, 0.0, 30.0, 160.0, 10.0)[0] == "dive"
    assert outcome.behind_cause(4.0, -40.0, 0.0, 0.0, 0.0, 0.0, 175.0, 12.0) == ("position", pytest.approx(1.5))
    assert outcome.behind_cause(4.0, -40.0, 0.0, 0.0, 0.0, 0.0, 175.0, 3.0) == (None, 0.0)


def test_behind_copy_leads_with_the_outcome_and_ends_with_the_bail_line():
    txt = outcome.behind_copy(-9.4, "loop", {"fwd": 13.2})
    assert txt == ("Missed behind. The bar finished 9 cm behind mid-foot. Earliest thing I can see: the bar swung 13 cm "
                   "forward off your hips and came back fast, so it looped behind you. "
                   "To bail behind safely: keep the arms locked and jump forward.")


def test_cue_texts_follow_the_cue_library_and_its_number_style():
    assert rules.CUES["chicken_wing"] == "Send both elbows over at once."
    assert rules.why_sentence("chicken_wing", {"chicken_wing": 0.133}, {"gap_s": 0.133, "side": "right"}) == (
        "Your right elbow crossed the bar 130 ms behind the other.")
    assert rules.why_sentence("chest_dive", {"chest_dive": 16.6}) == (
        "Your torso leaned 16 deg forward in the split, leaving your hips behind the bar.")
    banned = ("don't", "try to", "make sure", "focus on", "engage", "should", "just")
    for f, text in rules.CUES.items():
        assert len(text.rstrip(".").split()) <= 8
        assert not any(b in text.lower().replace("don't bump", "") for b in banned), f
        assert "—" not in text and "—" not in rules.WHY[f]


def test_gating_keeps_the_cause_over_its_effect():
    assert rules.gate({"bar_forward_off_hips", "jump_forward"}) == {"bar_forward_off_hips"}
    assert rules.gate({"hips_low_transition", "chicken_wing"}) == {"hips_low_transition"}
    assert rules.choose_set_cue("bar_muscle_up", [{"hips_low_transition": 40.0, "chicken_wing": 0.3},
                                                  {"hips_low_transition": 35.0, "chicken_wing": 0.2}]) == ("hips_low_transition", 2)
