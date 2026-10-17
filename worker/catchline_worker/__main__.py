import argparse
import json
import logging
import os
import sys
import time

from .heartbeat import Heartbeat, worker_id, worker_version
from .jobs import drain, process_one
from .push import Push
from .supa import Supabase


def client() -> Supabase:
    return Supabase(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def main() -> None:
    if sys.argv[1:2] == ["rerun"]:
        from .rerun import main as rerun_main

        return rerun_main(sys.argv[2:])
    ap = argparse.ArgumentParser(description="Catchline lift worker (also: rerun --since <date>)")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="process at most one job, then exit")
    mode.add_argument("--drain", action="store_true", help="process until the queue is empty, then exit")
    ap.add_argument("--poll", type=float, default=5.0, help="seconds between polls when idle")
    ap.add_argument("--workdir", default=None)
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    from .analyse import analyse

    db = client()
    push = Push()
    if a.drain:
        for r in drain(db, analyse, a.workdir, push=push):
            print(json.dumps(r), flush=True)
        return
    heartbeat = Heartbeat(db, worker_id(), worker_version())
    while True:
        heartbeat.beat()
        t = time.time()
        r = process_one(db, analyse, a.workdir, push=push)
        if r is not None:
            print(json.dumps(r | {"seconds": round(time.time() - t, 1)}), flush=True)
        if a.once:
            return
        if r is None:
            time.sleep(a.poll)


if __name__ == "__main__":
    main()
