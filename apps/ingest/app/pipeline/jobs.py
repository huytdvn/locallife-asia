"""RQ job definitions.

Job chính `ingest_job`:
  local_path → parse → normalize → (AI suggest FM) → render md →
  commit PR (GitHub) → [post-merge webhook] → sync → embed
"""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import Any

import redis
from rq import Queue

from app.config import get_settings
from app.pipeline.frontmatter import (
    Audience,
    Sensitivity,
    SourceRef,
    new_draft,
    suggest_metadata,
    to_markdown,
)
from app.pipeline.normalize import normalize
from app.pipeline.parsers import parse_file
from app.storage import github as gh

log = logging.getLogger(__name__)


def _queue() -> Queue:
    s = get_settings()
    conn = redis.from_url(s.redis_url)
    return Queue(s.job_queue_name, connection=conn)


def enqueue_ingest(
    *,
    local_path: str,
    ulid: str,
    owner_email: str,
    original_name: str,
    hint_audience: list[str],
    hint_sensitivity: str | None,
    hint_tags: list[str],
    note: str | None,
) -> str:
    job = _queue().enqueue(
        ingest_job,
        local_path=local_path,
        ulid=ulid,
        owner_email=owner_email,
        original_name=original_name,
        hint_audience=hint_audience,
        hint_sensitivity=hint_sensitivity,
        hint_tags=hint_tags,
        note=note,
        job_timeout=600,
        result_ttl=86400,
    )
    return job.id


def get_job_status(job_id: str) -> dict[str, Any]:
    from rq.exceptions import NoSuchJobError
    from rq.job import Job

    conn = redis.from_url(get_settings().redis_url)
    try:
        job = Job.fetch(job_id, connection=conn)
    except NoSuchJobError:
        return {"status": "not_found"}
    return {
        "status": job.get_status(),
        "result": job.result if job.is_finished else None,
        "error": str(job.exc_info) if job.is_failed else None,
    }


def ingest_job(
    *,
    local_path: str,
    ulid: str,
    owner_email: str,
    original_name: str,
    hint_audience: list[str],
    hint_sensitivity: str | None,
    hint_tags: list[str],
    note: str | None,
) -> dict[str, Any]:
    """Core pipeline. Raises nếu có bước fail — RQ sẽ mark job failed.

    Idempotent theo ulid: commit path = `raw-ulid/{ulid}/{slug}.md`.
    """
    del note  # reserved cho FM notes tương lai
    path = Path(local_path)
    parsed = parse_file(path)
    body = normalize(parsed)

    # AI suggest khi có key; fallback dùng hints
    try:
        sug = suggest_metadata(body)
        title = sug.title
        tags = list({*sug.tags, *hint_tags})
        audience = sug.suggested_audience
        sensitivity = sug.suggested_sensitivity
    except Exception as e:
        log.warning("AI suggest failed, fallback hints: %s", e)
        title = _default_title(original_name)
        tags = hint_tags or ["uncategorized"]
        audience = [Audience(a) for a in (hint_audience or ["employee"])]
        sensitivity = Sensitivity(hint_sensitivity or "internal")

    source = SourceRef(
        type=_source_type(path.suffix),
        path=f"raw-ulid/{ulid}{path.suffix.lower()}",
        captured_at=date.today(),
    )
    fm = new_draft(
        title=title,
        owner=owner_email,
        source=source,
        suggested_audience=audience,
        suggested_sensitivity=sensitivity,
        tags=tags,
    )
    md = to_markdown(fm, body)

    settings = get_settings()
    subdir = settings.knowledge_repo_subdir
    slug = _slugify(title)
    repo_path = f"{subdir}/inbox/{fm.id}-{slug}.md" if subdir else f"inbox/{fm.id}-{slug}.md"

    pr = gh.commit_via_pr(
        repo_path=repo_path,
        content=md,
        branch_prefix=f"ingest/{fm.id}",
        title=f"[ingest] {title}",
        body=_pr_body(fm, original_name),
        draft=True,
    )
    return {
        "doc_id": fm.id,
        "repo_path": repo_path,
        "pr_url": pr["pr_url"],
        "pr_number": pr["pr_number"],
        "branch": pr["branch"],
    }


_SOURCE_TYPE_MAP = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
    ".tif": "image",
    ".tiff": "image",
    ".md": "manual",
    ".txt": "manual",
}


def _source_type(ext: str) -> str:
    return _SOURCE_TYPE_MAP.get(ext.lower(), "manual")


def _default_title(filename: str) -> str:
    return Path(filename).stem.replace("_", " ").replace("-", " ").title()


def _slugify(s: str) -> str:
    import re
    import unicodedata

    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("đ", "d")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60] or "untitled"


def _pr_body(fm, original_name: str) -> str:  # type: ignore[no-untyped-def]
    return f"""Auto-ingested từ pipeline.

**Source**: `{original_name}`
**Doc id**: `{fm.id}`
**Status**: `draft` — owner vui lòng review.

Checklist trước khi approve:
- [ ] Nội dung không sai lệch so với bản gốc
- [ ] `audience` / `sensitivity` chính xác
- [ ] `tags` phản ánh đúng
- [ ] Path có cần chuyển ra khỏi `inbox/` không?

Sau khi merge:
- Tier 2 (local server) tự pull qua `sync-knowledge.sh`
- Tier 3 (R2 archive) tự upload qua webhook
- Qdrant re-embed (nếu có)
"""
