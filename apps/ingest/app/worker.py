"""RQ worker entrypoint.

Chạy:
    python -m app.worker
hoặc:
    rq worker -u $REDIS_URL ingest
"""

from __future__ import annotations

import logging
import os
import sys

import redis
from rq import Queue, SimpleWorker, Worker

from app.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def main() -> None:
    s = get_settings()
    conn = redis.from_url(s.redis_url)
    queue = Queue(s.job_queue_name, connection=conn)
    # macOS fork safety: default Worker fork()s và một số lib (urllib3, google
    # libs) crash Objc. Dùng SimpleWorker khi chạy darwin hoặc SIMPLE_WORKER=1.
    use_simple = sys.platform == "darwin" or os.environ.get("SIMPLE_WORKER") == "1"
    if use_simple:
        logging.info("Using SimpleWorker (no fork) — macOS or SIMPLE_WORKER=1")
        SimpleWorker([queue], connection=conn).work(with_scheduler=True)
    else:
        Worker([queue], connection=conn).work(with_scheduler=True)


if __name__ == "__main__":
    main()
