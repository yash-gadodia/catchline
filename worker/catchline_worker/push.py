import httpx
from catchline_cv.movement import NAMES

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def ready_message(movement: str) -> tuple[str, str]:
    return f"Your {NAMES.get(movement, movement)} is ready", "Tap to see your cue"


def failed_message() -> tuple[str, str]:
    return "We couldn't analyse that clip", "Tap to film it again"


class Push:
    """Expo push over plain HTTP. The payload is title, body and the lift id only: never media."""

    def __init__(self, http: httpx.Client | None = None):
        self.http = http or httpx.Client(timeout=10.0)

    def send(self, token: str, title: str, body: str, data: dict):
        r = self.http.post(EXPO_PUSH_URL, json={"to": token, "title": title, "body": body, "data": data})
        r.raise_for_status()
        return r.json()
