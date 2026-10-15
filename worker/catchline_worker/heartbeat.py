import logging
import os
import socket
import time
from pathlib import Path

import httpx

log = logging.getLogger(__name__)


def worker_id() -> str:
    return os.environ.get("CATCHLINE_WORKER_ID") or socket.gethostname()


def worker_version() -> str:
    """The git revision the deploy wrote next to the code (~/catchline-worker/REVISION), else 'dev'."""
    rev = Path(__file__).resolve().parents[2] / "REVISION"
    return rev.read_text().strip() if rev.exists() else "dev"


class Heartbeat:
    """Calls worker_heartbeat at most once per `every` seconds; a failed beat is logged, never fatal."""

    def __init__(self, db, worker: str, version: str, every: float = 60.0, clock=time.monotonic):
        self.db, self.worker, self.version, self.every, self.clock = db, worker, version, every, clock
        self.last: float | None = None

    def beat(self) -> bool:
        now = self.clock()
        if self.last is not None and now - self.last < self.every:
            return False
        self.last = now
        try:
            self.db.rpc("worker_heartbeat", {"p_worker": self.worker, "p_version": self.version})
        except httpx.HTTPError as e:
            log.warning("heartbeat failed: %s", e)
        return True
