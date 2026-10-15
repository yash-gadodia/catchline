import httpx

from catchline_worker.heartbeat import Heartbeat, worker_id


class Db:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def rpc(self, fn, args):
        self.calls.append((fn, args))
        if self.fail:
            raise httpx.ConnectError("supabase down")


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def test_beats_at_most_once_a_minute():
    db, clock = Db(), Clock()
    hb = Heartbeat(db, "mini", "abc123", clock=clock)
    assert hb.beat() is True
    clock.t += 5
    assert hb.beat() is False
    clock.t += 54.9
    assert hb.beat() is False
    clock.t += 0.1
    assert hb.beat() is True
    assert db.calls == [("worker_heartbeat", {"p_worker": "mini", "p_version": "abc123"})] * 2


def test_a_failed_beat_is_logged_not_raised_and_waits_a_minute(caplog):
    db, clock = Db(fail=True), Clock()
    hb = Heartbeat(db, "mini", "abc123", clock=clock)
    assert hb.beat() is True
    clock.t += 30
    assert hb.beat() is False
    assert len(db.calls) == 1
    assert "heartbeat failed: supabase down" in caplog.text


def test_worker_id_prefers_the_env(monkeypatch):
    monkeypatch.setenv("CATCHLINE_WORKER_ID", "mini-1")
    assert worker_id() == "mini-1"
