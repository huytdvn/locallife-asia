"""RQ worker entrypoint.

Chạy:
    python -m app.worker
hoặc:
    rq worker -u $REDIS_URL ingest
"""

from __future__ import annotations

import logging

import redis
from rq import Queue, Worker

from app.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def main() -> None:
    s = get_settings()
    conn = redis.from_url(s.redis_url)
    queue = Queue(s.job_queue_name, connection=conn)
    Worker([queue], connection=conn).work(with_scheduler=True)


if __name__ == "__main__":
    main()
