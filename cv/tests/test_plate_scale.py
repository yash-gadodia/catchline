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


def test_the_plate_diameter_only_counts_fits_whose_outline_held():
    assert plate_diameter(PHONE_POSE) == ((234.0, 263.0), 263.0)


def test_failed_fits_far_from_the_median_are_dropped():
    # 266 232 263 266 kept; 142 197 433 dropped
    assert plate_diameter(RTMPOSE) == ((213.0, 264.5), 264.5)


def test_both_pose_sources_now_agree_on_the_plate():
    a, b = plate_diameter(PHONE_POSE)[1], plate_diameter(RTMPOSE)[1]
    assert abs(a / b - 1) < 0.01


def test_no_refined_fit_means_no_plate_diameter():
    assert plate_diameter([fit(578, 312), fit(537, 376)]) == (None, None)


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


def test_no_plate_fit_held_falls_back_to_the_body():
    assert check_scale(5.1, "x", False, 5.1, 4.66) == (4.66, "body segments (plate fit unreliable)", False)


@pytest.mark.parametrize("method", ["body segments (plate fit unreliable)",
                                    "near plate only (no parallax), depth from the lifter's body"])
def test_bar_speed_is_not_timed_on_an_estimated_scale(method):
    row = speed.measurement({"bar_speed": (2.1, 80), "scale_method": method, "events": {"second_ext": 40}})
    assert (row["status"], row["note"]) == ("not_seen", "scale too uncertain to time the bar")
