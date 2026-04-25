"""Source: HTTP upload. Handler gọi từ FastAPI route."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.pipeline.jobs import enqueue_ingest
from app.storage.raw import (
    content_sha256,
    find_existing_by_hash,
    raw_store,
    register_hash,
)


@dataclass
class SimilarMatch:
    id: str
    title: str
    path: str
    similarity: float
    reason: str


@dataclass
class UploadResult:
    job_id: str | None
    local_path: str | None
    ulid: str | None
    drive_file_id: str | None
    sha256: str
    dedup_status: str  # "new" | "duplicate" | "in-flight" | "re-ingested" | "review-needed"
    existing_doc_path: str | None = None
    similar_matches: list[dict] | None = None


def _kb_inbox() -> Path:
    """Tìm thư mục knowledge/ (cùng logic fallback như web loader)."""
    candidates = [
        Path("knowledge"),
        Path("../knowledge"),
        Path("../../knowledge"),
    ]
    for c in candidates:
        if c.exists() and c.is_dir():
            return c.resolve()
    # Default return — bật khả năng tạo mới
    return candidates[-1].resolve()


def _quick_parse_text(filename: str, data: bytes) -> str:
    """Best-effort parse để lấy excerpt cho similarity check.

    Không dùng Gemini — chỉ text extraction nhanh. Nếu file không parse
    được → trả rỗng (bỏ qua similarity check).
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    try:
        if ext in ("md", "txt"):
            return data.decode("utf-8", errors="ignore")[:4000]
        if ext == "pdf":
            import io
            import pdfplumber  # type: ignore

            with pdfplumber.open(io.BytesIO(data)) as pdf:
                pieces = []
                for p in pdf.pages[:5]:
                    pieces.append(p.extract_text() or "")
                return ("\n".join(pieces))[:4000]
        if ext == "docx":
            import io
            from docx import Document  # type: ignore

            doc = Document(io.BytesIO(data))
            return "\n".join(p.text for p in doc.paragraphs[:200])[:4000]
    except Exception:
        return ""
    return ""


def _tokenize_for_sim(s: str) -> set[str]:
    import re
    import unicodedata

    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")
    return set(t for t in re.split(r"[^a-z0-9]+", s) if len(t) >= 3)


def find_similar_existing(
    kb_dir: Path,
    filename: str,
    content_text: str,
    threshold: float = 0.55,
    limit: int = 5,
) -> list[dict]:
    """Scan knowledge/ docs, trả các doc có Jaccard(tokens) >= threshold."""
    import re

    import yaml  # type: ignore

    if not content_text.strip():
        return []
    incoming_tokens = _tokenize_for_sim(filename + " " + content_text)
    if not incoming_tokens:
        return []

    matches: list[tuple[float, dict]] = []
    for md in kb_dir.rglob("*.md"):
        if md.name == "README.md":
            continue
        try:
            raw = md.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", raw, re.DOTALL)
        if not m:
            continue
        try:
            fm = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError:
            continue
        if fm.get("status") == "deprecated":
            continue
        body_tokens = _tokenize_for_sim(fm.get("title", "") + " " + m.group(2)[:4000])
        if not body_tokens:
            continue
        inter = len(incoming_tokens & body_tokens)
        union = len(incoming_tokens | body_tokens)
        sim = inter / union if union else 0
        if sim >= threshold:
            matches.append(
                (
                    sim,
                    {
                        "id": str(fm.get("id", "")),
                        "title": str(fm.get("title", "")),
                        "path": md.relative_to(kb_dir).as_posix(),
                        "similarity": round(sim, 3),
                        "reason": (
                            "Gần như trùng toàn bộ" if sim > 0.85
                            else "Overlap cao" if sim > 0.7
                            else "Có chung nhiều thuật ngữ"
                        ),
                    },
                )
            )
    matches.sort(key=lambda x: -x[0])
    return [m[1] for m in matches[:limit]]


def handle_upload(
    *,
    filename: str,
    data: bytes,
    owner_email: str,
    hint_audience: list[str] | None = None,
    hint_sensitivity: str | None = None,
    hint_tags: list[str] | None = None,
    note: str | None = None,
    force: bool = False,
    target_zone: str | None = None,
    target_dept: str | None = None,
    target_subfolder: str | None = None,
) -> UploadResult:
    """Upload với:
    1. SHA256 dedup (exact file) → in-flight/duplicate
    2. AI similarity pre-check (Jaccard tokens) → review-needed
    3. target_zone/dept override: admin chỉ định nhánh, bỏ qua AI classify
    """
    sha = content_sha256(data)
    kb_dir = _kb_inbox()

    if not force:
        existing, source = find_existing_by_hash(kb_dir, sha)
        if existing is not None:
            try:
                rel = existing.relative_to(kb_dir)
            except ValueError:
                rel = existing
            label = "duplicate" if source == "kb" else "in-flight"
            return UploadResult(
                job_id=None,
                local_path=None,
                ulid=None,
                drive_file_id=None,
                sha256=sha,
                dedup_status=label,
                existing_doc_path=str(rel),
            )

        # Similarity pre-check
        excerpt = _quick_parse_text(filename, data)
        similar = find_similar_existing(kb_dir, filename, excerpt)
        if similar:
            return UploadResult(
                job_id=None,
                local_path=None,
                ulid=None,
                drive_file_id=None,
                sha256=sha,
                dedup_status="review-needed",
                similar_matches=similar,
            )

    stored = raw_store(filename, data)
    register_hash(sha, stored["ulid"])
    job = enqueue_ingest(
        local_path=stored["local_path"],
        ulid=stored["ulid"],
        owner_email=owner_email,
        original_name=filename,
        hint_audience=hint_audience or [],
        hint_sensitivity=hint_sensitivity,
        hint_tags=hint_tags or [],
        note=note,
        source_sha256=stored["sha256"],
        target_zone=target_zone,
        target_dept=target_dept,
        target_subfolder=target_subfolder,
    )
    return UploadResult(
        job_id=job,
        local_path=stored["local_path"],
        ulid=stored["ulid"],
        drive_file_id=stored.get("drive_file_id"),
        sha256=stored["sha256"],
        dedup_status="new" if not force else "re-ingested",
    )


def to_dict(r: UploadResult) -> dict[str, Any]:
    return asdict(r)
