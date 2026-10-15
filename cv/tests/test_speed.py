import numpy as np
import pytest

from catchline_cv import speed


def test_peak_up_speed_in_metres_per_second():
    # 10 px per cm, 100 fps: rising 20 px a frame is 20 * 100 / 10 / 100 = 2 m/s
    y = np.concatenate([np.full(10, 1000.0), 1000.0 - 20.0 * np.arange(1, 11), np.full(10, 800.0)])
    v, frame = speed.peak_up_speed(y, 100, 10.0, 0, len(y) - 1)
    assert v == pytest.approx(2.0)
    assert 10 <= frame <= 19


def test_peak_up_speed_only_inside_the_window():
    y = np.concatenate([1000.0 - 40.0 * np.arange(10), np.full(10, 640.0), 640.0 - 10.0 * np.arange(1, 11)])
    v, frame = speed.peak_up_speed(y, 50, 5.0, 12, 29)
    assert v == pytest.approx(10 * 50 / 5.0 / 100)
    assert frame >= 20


def test_peak_up_speed_ignores_lost_frames_and_refuses_short_windows():
    y = 1000.0 - 15.0 * np.arange(20)
    y[5] = np.nan
    assert speed.peak_up_speed(y, 60, 10.0, 0, 19)[0] == pytest.approx(15 * 60 / 10.0 / 100)
    assert speed.peak_up_speed(y, 60, 10.0, 4, 5) is None
    assert speed.peak_up_speed(y, 60, 0, 0, 19) is None


def rep(sp, method="harmonic mean of near and far plates"):
    return {"bar_speed": sp, "scale_method": method, "events": {"second_ext": 40}}


def test_measurement_row_two_decimals():
    assert speed.measurement(rep((1.8361, 44))) == {
        "id": "bar_speed", "label": "Peak bar speed", "value": 1.84, "unit": "m/s", "frame": 44, "status": "normal",
        "note": "peak upward speed in the pull"}


def test_measurement_hidden_when_the_scale_is_uncertain():
    row = speed.measurement(rep((1.8, 44), "near plate only (no parallax: plate rise too small or lost)"))
    assert row["status"] == "not_seen"
    assert row["value"] == 0
    assert row["note"] == "scale too uncertain to time the bar"
    assert speed.measurement(rep(None))["status"] == "not_seen"


def test_measurement_hidden_when_the_speed_is_a_tracking_jump():
    row = speed.measurement(rep((13.8, 86)))
    assert (row["status"], row["note"]) == ("not_seen", "bar track too unsteady to time")
    assert speed.measurement(rep((0.2, 86)))["status"] == "not_seen"
    assert speed.measurement(rep((3.4, 95)))["value"] == 3.4
