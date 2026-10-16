"""The plate scale from real setup-frame fits on 21B27BAF (app transcode, 1280 px inference frames). Run with the phone's
pose, the old median over every fit, refined or not, read the plate as 598 px tall (px/cm 11.2 at 1080, bar peak 50 cm);
with RTMPose it read 223 px (px/cm 4.5, peak 123 cm). By eye the plate is ~260 px across, and the plate itself rose
132-138 cm to the bar's peak."""
import pytest

from catchline_cv import speed
from catchline_cv.pipeline import PLATE_CM, check_scale, near_bar_scale, plate_diameter


def fit(v, h, inliers=None):
    """A setup-frame plate fit, axes (vertical, horizontal) px. Refined fits carry fit_inliers; the coarse ones the
    pipeline falls back to when refining fails do not."""
    return {"axes": (v, h), "side": "near"} | ({"fit_inliers": inliers} if inliers else {})


# seed frame, then the 8 setup samples (the last is the seed frame again), as measured
PHONE_POSE = [fit(234, 263, .45), fit(387, 387), fit(627, 351), fit(612, 380), fit(585, 363), fit(193, 276, .58),
              fit(627, 364), fit(610, 391), fit(234, 263, .45)]
RTMPOSE = [fit(213, 266, .41), fit(127, 142, .44), fit(170, 232, .58), fit(197, 134, .54), fit(433, 181, .53),
           fit(578, 312), fit(537, 376), fit(233, 263, .43), fit(213, 266, .41)]


# 3866908355418040243.mp4 (owner's snatch, both plates in view ~33 deg off side-on; by eye the near plate is 193 px
# tall and 162 wide): the coarse search reads it 241-270 tall, the refined fits 134-171 tall and 187-224 wide
SPECKLED = [fit(270, 173), fit(270, 183), fit(241, 183), fit(139, 197, .40), fit(136, 187, .48), fit(171, 107, .53),
            fit(267, 171), fit(134, 224, .48), fit(270, 173)]


def test_fits_implausible_for_the_lifters_size_are_dropped_and_the_scale_uses_refined_fits():
    # body 4.66 px/cm: a plate is 157-367 px; the 585-627 px floor patches go
    assert plate_diameter(PHONE_POSE, 4.66) == ((234.0, 263.0), 263.0, True)


def test_refined_fits_far_from_their_median_are_dropped():
    # in band (158-369 px): 266 232 197 263 266; then 197 is >15% off the median
    assert plate_diameter(RTMPOSE, 4.68) == ((213.0, 263.0), 264.5, True)


def test_both_pose_sources_now_agree_on_the_plate():
    a, b = plate_diameter(PHONE_POSE, 4.66)[1], plate_diameter(RTMPOSE, 4.68)[1]
    assert abs(a / b - 1) < 0.01


def test_a_speckled_plate_keeps_its_angle_from_every_fit_and_its_size_from_the_refined_ones():
    axes, diameter, refined = plate_diameter(SPECKLED, 3.75)
    assert (axes, diameter, refined) == ((241.0, 183.0), 187.0, True)  # angle arccos(183/241) = 41 deg; old median 27


def test_no_plausible_refined_fit_keeps_the_coarse_size_but_says_so():
    assert plate_diameter([fit(270, 173), fit(241, 183)], 3.75) == ((255.5, 178.0), 255.5, False)


def test_no_plausible_fit_at_all():
    assert plate_diameter([fit(578, 312), fit(537, 376)], 4.68) == (None, None, False)


def test_without_parallax_the_bar_sits_at_the_body_depth():
    # RTMPose run: the plate is lost before the pull ends; body segments read 4.68 px/cm
    px, method = near_bar_scale(264.5 / PLATE_CM, None, 4.68)
    assert px == pytest.approx(4.68)
    assert method == "near plate only (no parallax), depth from the lifter's body"


def test_a_measured_parallax_wins_over_the_body():
    # phone-pose run: the plate tracked through the pull, depth ratio 0.831
    px, method = near_bar_scale(263 / PLATE_CM, 0.831, 4.66)
    assert px == pytest.approx(4.857, abs=1e-3)
    assert method == "near plate x parallax depth ratio 0.83"


def test_the_body_depth_never_puts_the_bar_nearer_than_the_plate():
    assert near_bar_scale(5.0, None, 6.0)[0] == pytest.approx(5.0)
    assert near_bar_scale(5.0, None, 2.0)[0] == pytest.approx(3.75)


def test_a_plate_scale_far_off_the_body_falls_back_to_the_body_with_low_confidence():
    # the old phone-pose plate: 598 px tall = 13.28 px/cm against 4.66 from the body (2.85x)
    assert check_scale(13.28, "near plate only (no parallax: plate rise too small or lost)", True, 598 / PLATE_CM, 4.66) == \
        (4.66, "body segments (plate fit unreliable)", False)


def test_a_plate_scale_in_line_with_the_body_is_kept():
    assert check_scale(4.857, "near plate x parallax depth ratio 0.83", True, 263 / PLATE_CM, 4.66) == \
        (4.857, "near plate x parallax depth ratio 0.83", True)


def test_a_plausible_coarse_plate_is_kept_with_low_confidence():
    # IMG_0074 rep 4: no refined fit, coarse plate 351 px, the lifter half out of frame (body 9.56 px/cm)
    assert check_scale(7.8, "x", False, 351 / PLATE_CM, 9.56) == (7.8, "x", False)


@pytest.mark.parametrize("method", ["body segments (plate fit unreliable)",
                                    "near plate only (no parallax), depth from the lifter's body"])
def test_bar_speed_is_not_timed_on_an_estimated_scale(method):
    row = speed.measurement({"bar_speed": (2.1, 80), "scale_method": method, "events": {"second_ext": 40}})
    assert (row["status"], row["note"]) == ("not_seen", "scale too uncertain to time the bar")
