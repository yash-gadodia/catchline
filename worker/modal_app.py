"""Modal deployment for the Catchline worker (live since 18 Oct 2026; replaces the Mac Mini worker).

Deploy (see docs/catchline/BACKEND_SETUP.md), from the repo root:
    git rev-parse --short HEAD > worker/REVISION && modal deploy worker/modal_app.py

Two ways in, both just drain the pgmq queue (the queue is the source of truth):
  - `wake`: a POST from Postgres (public.wake_worker via pg_net) right after a lift is enqueued.
  - `sweep`: every 2 minutes, in case a wake was lost.
"""

from __future__ import annotations

from pathlib import Path

import modal

HERE = Path(__file__).parent
CV = HERE.parent / "cv"


def _bake_models():
    from rtmlib import YOLOX, BodyWithFeet, RTMPose

    cfg = BodyWithFeet.MODE["balanced"]
    YOLOX(cfg["det"], model_input_size=cfg["det_input_size"], backend="onnxruntime", device="cpu")
    RTMPose(cfg["pose"], model_input_size=cfg["pose_input_size"], backend="onnxruntime", device="cpu")


image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .pip_install(
        # the versions worker/uv.lock resolves (the Mini ran these), so cloud and CI analyse alike
        "rtmlib==0.0.16",
        "onnxruntime==1.31.0",
        "opencv-python-headless==5.0.0.93",
        "numpy==2.5.4",
        "scipy==1.18.1",
        "httpx==0.28.1",
        "fastapi[standard]",
    )
    .run_function(_bake_models)
    .add_local_dir(CV / "catchline_cv", "/root/catchline_cv")
    .add_local_dir(HERE / "catchline_worker", "/root/catchline_worker")
    # heartbeat.worker_version reads REVISION two levels above catchline_worker/heartbeat.py
    .add_local_file(HERE / "REVISION", "/REVISION")
)

with image.imports():
    from fastapi import HTTPException, Request

app = modal.App("catchline-worker", image=image)
secrets = [modal.Secret.from_name("catchline-supabase")]


@app.function(secrets=secrets, cpu=2.0, memory=4096, timeout=900, scaledown_window=180, max_containers=4)
def drain() -> list[dict]:
    import logging

    from catchline_worker.__main__ import client
    from catchline_worker.analyse import analyse
    from catchline_worker.jobs import drain as run

    logging.basicConfig(level=logging.INFO)
    return run(client(), analyse, "/tmp")


@app.function(secrets=secrets, schedule=modal.Period(minutes=2))
def sweep() -> None:
    # ops_health_check alerts after 3 min without a heartbeat; the sweep is the worker's pulse
    from catchline_worker.__main__ import client
    from catchline_worker.heartbeat import Heartbeat, worker_version

    Heartbeat(client(), "modal", worker_version()).beat()
    drain.spawn()


@app.function(secrets=secrets)
@modal.fastapi_endpoint(method="POST")
def wake(request: Request):
    import os

    if request.headers.get("authorization") != f"Bearer {os.environ['WORKER_TOKEN']}":
        raise HTTPException(status_code=401)
    drain.spawn()
    return {"ok": True}
