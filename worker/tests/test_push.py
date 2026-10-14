import json

import httpx
import pytest

from catchline_worker.push import EXPO_PUSH_URL, Push, failed_message, ready_message
from catchline_worker.supa import Supabase


def recording_client(status=200, body=None):
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(status, json=body if body is not None else {"data": {"status": "ok"}})

    return httpx.Client(transport=httpx.MockTransport(handler)), seen


def test_ready_message_uses_the_human_movement_name():
    assert ready_message("snatch") == ("Your snatch is ready", "Tap to see your cue")
    assert ready_message("kipping_pull_up") == ("Your kipping pull-up is ready", "Tap to see your cue")


def test_failed_message():
    assert failed_message() == ("We couldn't analyse that clip", "Tap to film it again")


def test_send_posts_exactly_the_expo_payload():
    http, seen = recording_client()
    out = Push(http).send("ExponentPushToken[abc]", "Your snatch is ready", "Tap to see your cue", {"liftId": "lift-1"})
    assert out == {"data": {"status": "ok"}}
    assert len(seen) == 1
    req = seen[0]
    assert req.method == "POST"
    assert str(req.url) == EXPO_PUSH_URL
    assert req.headers["content-type"] == "application/json"
    assert json.loads(req.content) == {
        "to": "ExponentPushToken[abc]",
        "title": "Your snatch is ready",
        "body": "Tap to see your cue",
        "data": {"liftId": "lift-1"},
    }


def test_send_raises_on_http_error():
    http, _ = recording_client(status=500, body={"errors": [{"code": "INTERNAL"}]})
    with pytest.raises(httpx.HTTPStatusError):
        Push(http).send("ExponentPushToken[abc]", "t", "b", {"liftId": "lift-1"})


def test_push_token_reads_the_owner_profile():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[{"push_token": "ExponentPushToken[abc]"}])

    db = Supabase("https://db.test", "service-key")
    db.http = httpx.Client(base_url="https://db.test", transport=httpx.MockTransport(handler))
    assert db.push_token("user-1") == "ExponentPushToken[abc]"
    assert str(seen[0].url) == "https://db.test/rest/v1/profiles?id=eq.user-1&select=push_token"


def test_push_token_is_none_without_a_row_or_token():
    def no_row(request):
        return httpx.Response(200, json=[])

    def null_token(request):
        return httpx.Response(200, json=[{"push_token": None}])

    db = Supabase("https://db.test", "service-key")
    db.http = httpx.Client(base_url="https://db.test", transport=httpx.MockTransport(no_row))
    assert db.push_token("user-1") is None
    db.http = httpx.Client(base_url="https://db.test", transport=httpx.MockTransport(null_token))
    assert db.push_token("user-1") is None
